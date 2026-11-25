"""Independent exact and metamorphic SymPy oracles for the Geometry CLI."""

import ast
from collections import Counter
import json
from pathlib import Path
import re
import subprocess
import sys

import sympy as sp


NUMBER = r"(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?"
MEASURES = {
    "diagonal": 1, "diameter": 1, "circumference": 1, "perimeter": 1, "distance": 1,
    "slant_height": 1, "base_perimeter": 1, "point": 1, "from": 1, "to": 1,
    "area": 2, "surface_area": 2, "base_area": 2, "lateral_area": 2, "volume": 3,
}
CATEGORIES = {"sides", "angles", "orientation", "relation"}


def read_math(text):
    """Decode exact scalar expressions and point lists without executing output."""
    source = text.strip().replace("^", "**").replace("π", "pi").replace("−", "-")
    assert len(source) <= 32768, text[:80]
    tree = ast.parse(source, mode="eval")
    assert sum(1 for _ in ast.walk(tree)) <= 4096, text[:80]

    def read(node):
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            literal = ast.get_source_segment(source, node)
            assert literal and re.fullmatch(NUMBER, literal), literal
            exponent = re.search(r"e([+-]?\d+)$", literal, re.I)
            assert not exponent or abs(int(exponent[1])) <= 4096, literal
            return sp.Rational(literal)
        if isinstance(node, ast.Name) and node.id == "pi":
            return sp.pi
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            value = read(node.operand)
            return -value if isinstance(node.op, ast.USub) else value
        if isinstance(node, ast.BinOp):
            a, b = read(node.left), read(node.right)
            if isinstance(node.op, ast.Add):
                return a + b
            if isinstance(node.op, ast.Sub):
                return a - b
            if isinstance(node.op, ast.Mult):
                return a * b
            if isinstance(node.op, ast.Div):
                assert b != 0, text
                return a / b
            if isinstance(node.op, ast.Pow):
                assert b.is_Integer and abs(b) <= 16, (text, b)
                return a ** b
        if isinstance(node, ast.List):
            return tuple(read(item) for item in node.elts)
        if (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
                and len(node.args) == 1 and not node.keywords):
            functions = {"sqrt": sp.sqrt, "acos": sp.acos}
            if node.func.id in functions:
                return functions[node.func.id](read(node.args[0]))
        raise AssertionError(f"Unexpected geometry notation: {text!r}")

    return read(tree.body)


def read_result(text):
    fields = {}
    for entry in text.split("; "):
        key, separator, raw_value = entry.partition("=")
        assert separator and key not in fields and re.fullmatch(r"[a-z_]+", key), text
        fields[key] = raw_value if key in CATEGORIES else read_math(raw_value)
    return fields


def equivalent(actual, expected):
    if isinstance(expected, (str, tuple)):
        assert actual == expected, (actual, expected)
    else:
        difference = sp.simplify(actual - expected)
        assert difference == 0, (actual, expected, difference)


def coordinate_source(points):
    return ";".join(" ".join(map(str, point)) for point in points)


def segment_reference(points):
    a, b, c, d = map(sp.Matrix, points)
    directions = sp.Matrix.hstack(b-a, c-d)
    solutions = sp.linsolve((directions, c-a))
    if solutions == sp.EmptySet:
        return {"relation": "disjoint"}
    t, s = next(iter(solutions))
    if not (t.free_symbols or s.free_symbols):
        if not (0 <= t <= 1 and 0 <= s <= 1):
            return {"relation": "disjoint"}
        kind = "touch" if t in (0, 1) or s in (0, 1) else "cross"
        return {"relation": kind, "point": tuple(a + t*(b-a))}
    first, second = sorted((tuple(a), tuple(b))), sorted((tuple(c), tuple(d)))
    low, high = max(first[0], second[0]), min(first[1], second[1])
    if low > high:
        return {"relation": "disjoint"}
    if low == high:
        return {"relation": "touch", "point": low}
    return {"relation": "overlap", "from": low, "to": high}


def polygon_reference(points):
    """Use an oriented triangle fan and exact vector norms."""
    vertices = list(map(sp.Matrix, points))
    anchor = vertices[0]
    area = sum(sp.det(sp.Matrix.hstack(left-anchor, right-anchor))
               for left, right in zip(vertices[1:], vertices[2:])) / 2
    perimeter = sum((right-left).norm() for left, right in zip(vertices, vertices[1:] + vertices[:1]))
    return area, perimeter


def valid_polygon_reference(points):
    """Require individual segments to meet only at adjacent shared vertices."""
    vertices = list(map(tuple, points))
    if len(vertices) < 3 or len(set(vertices)) != len(vertices):
        return False
    edges = list(zip(vertices, vertices[1:] + vertices[:1]))
    for i, edge in enumerate(edges):
        for j, other in enumerate(edges[:i]):
            intersection = segment_reference(edge + other)
            if i == j + 1 or (i, j) == (len(edges) - 1, 0):
                joint = next(iter(set(edge) & set(other)))
                if intersection != {"relation": "touch", "point": joint}:
                    return False
            elif intersection["relation"] != "disjoint":
                return False
    area, _ = polygon_reference(points)
    return area != 0


def rigid(points, transform, offset):
    return [tuple(transform * sp.Matrix(point) + sp.Matrix(offset)) for point in points]


class Oracle:
    def __init__(self, executable):
        self.executable = executable
        self.checks = Counter()

    def invoke(self, payload):
        process = subprocess.run([self.executable, "tool", payload], capture_output=True, encoding="utf-8", timeout=12)
        assert process.stdout.strip(), (payload, process.returncode, process.stderr)
        response = json.loads(process.stdout)
        assert process.returncode == (0 if response["ok"] else 1), (payload, response, process.stderr)
        return response

    def request(self, operation, source, options, *, original=None):
        request = {"schema": 1, "module": "geometry", "operation": operation, "input": source, "options": options}
        if original is not None:
            request["original_input"] = original
        return self.invoke(json.dumps(request, ensure_ascii=False))

    def record(self, operation, source, options, *, original=None):
        response = self.request(operation, source, options, original=original)
        assert response["ok"], (operation, source, options, response)
        proof = response["proof"]
        assert (proof["schema"], proof["module"], proof["operation"]) == (1, "geometry", operation), proof
        assert proof["expression"] == (source if original is None else original), proof
        assert proof["options"] == options, proof
        assert proof["algorithm_version"].startswith("geometry/"), proof
        assert proof["exactness"] in ("exact", "symbolic"), proof
        assert all(proof[field] is None for field in ("precision", "tolerance", "rounding", "error_bound")), proof
        assert all(proof[field] for field in ("result", "normalized", "method", "formula", "domain", "references")), proof
        return proof

    def compare(self, operation, source, expected, *, original=None, **options):
        proof = self.record(operation, source, options, original=original)
        observed = read_result(proof["result"])
        assert list(observed) == list(expected), (proof, expected)
        for name, value in expected.items():
            equivalent(observed[name], value)
        length = options.get("unit", "u")
        units = {name: (length if MEASURES[name] == 1 else f"{length}^{MEASURES[name]}")
                 for name in expected if name in MEASURES}
        if "angle" in expected:
            units["angle"] = options.get("angle", "deg")
        assert proof["units"] == units, (proof, units)
        symbolic = any(isinstance(value, sp.Expr) and not value.is_Rational for value in expected.values())
        assert proof["exactness"] == ("symbolic" if symbolic else "exact"), proof
        self.checks["untrusted display text" if original is not None else operation] += 1
        return observed

    def rectangle(self, width, height, *, source=None, **options):
        area, perimeter = polygon_reference([(0, 0), (width, 0), (width, height), (0, height)])
        diagonal = sp.Matrix([width, height]).norm()
        return self.compare("rectangle", source or f"{width} {height}",
                            {"area": area, "perimeter": perimeter, "diagonal": diagonal}, **options)

    def circle(self, radius, *, source=None, **options):
        shape = sp.Circle((0, 0), radius)
        return self.compare("circle", source or str(radius),
                            {"diameter": 2*shape.radius, "circumference": shape.circumference,
                             "area": shape.area}, **options)

    def triangle(self, sides, *, source=None, **options):
        a, b, base = map(sp.Rational, sides)
        projection = (a**2 + base**2 - b**2) / (2*base)
        area = base * sp.sqrt(a**2 - projection**2) / 2
        name = {1: "equilateral", 2: "isosceles", 3: "scalene"}[len(set(sides))]
        dot = sum(side**2 for side in sides) - 2*max(sides)**2
        angles = {-1: "obtuse", 0: "right", 1: "acute"}[int(sp.sign(dot))]
        return self.compare("triangle", source or " ".join(map(str, sides)),
                            {"perimeter": a + b + base, "area": area,
                             "sides": name, "angles": angles}, **options)

    def polygon(self, points, *, source=None, **options):
        area, perimeter = polygon_reference(points)
        assert area != 0, points
        orientation = "counterclockwise" if area > 0 else "clockwise"
        return self.compare("polygon", source or coordinate_source(points),
                            {"area": abs(area), "perimeter": perimeter,
                             "orientation": orientation}, **options)

    def solid(self, operation, radius, height=None, **options):
        radius = sp.Rational(radius)
        base = sp.Circle((0, 0), radius)
        if operation == "sphere":
            surface = 4 * base.area
            # Cross sections of the sphere are disks of radius sqrt(r²-z²).
            z = sp.Symbol("z")
            volume = sp.integrate(sp.pi * (radius**2 - z**2), (z, -radius, radius))
            return self.compare(operation, str(radius), {"surface_area": surface, "volume": volume}, **options)
        height = sp.Rational(height)
        if operation == "cylinder":
            lateral = base.circumference * height
            volumes = {"base_area": base.area, "lateral_area": lateral,
                       "surface_area": 2*base.area + lateral, "volume": base.area * height}
        else:
            slant = sp.Matrix((radius, height)).norm()
            lateral = base.circumference * slant / 2
            z = sp.Symbol("z")
            volume = sp.integrate(base.area * (1 - z/height)**2, (z, 0, height))
            volumes = {"slant_height": slant, "base_area": base.area, "lateral_area": lateral,
                       "surface_area": base.area + lateral, "volume": volume}
        return self.compare(operation, f"{radius} {height}", volumes, **options)

    def prism(self, points, height, *, source=None, **options):
        area, perimeter = polygon_reference(points)
        area = abs(area)
        lateral = perimeter * height
        return self.compare("prism", source or f"{coordinate_source(points)}|{height}",
                            {"base_area": area, "base_perimeter": perimeter, "lateral_area": lateral,
                             "surface_area": 2*area + lateral, "volume": area*height}, **options)

    def distance(self, points, *, source=None, **options):
        a, b = map(sp.Matrix, points)
        return self.compare("distance", source or coordinate_source(points), {"distance": (b-a).norm()}, **options)

    def angle(self, points, *, source=None, **options):
        a, v, b = [sp.Matrix(point) for point in points]
        l, r = a-v, b-v
        radians = sp.acos(l.dot(r) / (l.norm()*r.norm()))
        expected = radians if options.get("angle") == "rad" else radians * 180 / sp.pi
        return self.compare("angle", source or coordinate_source(points), {"angle": expected}, **options)

    def segments(self, points, *, source=None, **options):
        return self.compare("segments", source or coordinate_source(points), segment_reference(points), **options)

    def replay(self, operation, source, **options):
        first = self.record(operation, source, options)
        replayed = self.record(operation, first["normalized"], options, original=source)
        assert replayed == first, (first, replayed)
        self.checks["normalized replay"] += 1

    def reject(self, operation, source, code, *, original=None, **options):
        response = self.request(operation, source, options, original=original)
        assert response == {"ok": False, "code": code}, (operation, source[:100], options, code, response)
        self.checks["rejected"] += 1


def plane_cases(oracle):
    r = sp.Rational
    for unit in ("u", "mm", "cm", "m", "km", "in", "ft", "yd", "mi"):
        oracle.rectangle(3, 4, unit=unit)
    oracle.rectangle(1, 1)
    oracle.rectangle(r(3, 2), r(5, 4), source="1.50 125e-2")
    oracle.rectangle(r(1, 10**22), r(1, 10**22))
    oracle.rectangle(9_007_199_254_740_993, 1)
    for radius in (1, 3, r(5, 11), r(1, 10**19), 90_071_992_547_409_931):
        oracle.circle(radius, unit="mm")
    for sides in ((3, 4, 5), (5, 4, 3), (1, 1, 1), (5, 5, 6), (2, 2, 3), (2, 3, 4),
                  (4, 5, 6), (r(3, 7), r(4, 7), r(5, 7)), (1, 1, 2-r(1, 10**22))):
        oracle.triangle(sides, unit="cm")

    rectangle = [(0, 0), (4, 0), (4, 3), (0, 3)]
    concave = [(0, 0), (4, 0), (4, 4), (2, 1), (0, 4)]
    fractional = [(0, 0), (r(1, 2), 0), (r(2, 3), r(5, 6)), (0, 1)]
    thin = [(0, 0), (10**20, 0), (10**20, r(1, 10**20)), (0, r(1, 10**20))]
    for points in (rectangle, concave, fractional, thin, [(0, 0), (3, 0), (2, 2)]):
        assert valid_polygon_reference(points), points
        oracle.polygon(points)
    oracle.polygon(rectangle, source="0 0\n4 0\n4 3\n0 3\n0 0", unit="ft")
    oracle.polygon(rectangle[::-1])
    oracle.polygon(rectangle[1:] + rectangle[:1])
    maximal = [(i, i*i) for i in range(32)]
    assert valid_polygon_reference(maximal)
    oracle.polygon(maximal)


def solid_cases(oracle):
    r = sp.Rational
    for radius in (1, 2, r(3, 5), r(1, 10**12)):
        oracle.solid("sphere", radius, unit="m")
    for radius, height in ((3, 4), (1, 1), (r(3, 5), r(7, 11)), (r(1, 10**13), r(1, 10**12))):
        oracle.solid("cylinder", radius, height, unit="m")
        oracle.solid("cone", radius, height, unit="in")
    for points, height in [([(0, 0), (3, 0), (3, 4), (0, 4)], 2),
                           ([(0, 0), (2, 0), (0, 2)], r(5, 3)),
                           ([(0, 0), (4, 0), (4, 4), (2, 1), (0, 4)], r(3, 2))]:
        oracle.prism(points, height, unit="yd")


def cartesian_cases(oracle):
    r = sp.Rational
    for points in [((0, 0), (3, 4)), ((-3, 4), (2, -7)), ((2, 2), (2, 2)), ((0, 0, 0), (2, 3, 6)),
                   ((0, 0, 0), (1, 1, 1)), ((r(1, 3), r(2, 7)), (r(2, 3), r(-9, 11))),
                   ((10**24, 0), (10**24 + r(1, 10**20), 0))]:
        oracle.distance(points, unit="km")
    oracle.distance(((1, 2, 3), (4, 5, 6)), source="1 2 3\n4 5 6", unit="mi")

    for points in [((1, 0), (0, 0), (0, 1)), ((1, 0), (0, 0), (1, 1)),
                   ((1, 0), (0, 0), (-1, 1)), ((2, 0), (0, 0), (-6, 0)), ((2, 0), (0, 0), (6, 0)),
                   ((1, 0, 1), (0, 0, 0), (0, 1, 1)), ((1, 1, 0), (0, 0, 0), (-1, 0, 1)),
                   ((1, 0), (0, 0), (2, 1)), ((1, 0), (0, 0), (1, r(1, 10**22))),
                   ((2, 4), (-1, 2), (5, -3))]:
        oracle.angle(points, unit="m")
        oracle.angle(points, angle="rad")

    delta = r(1, 10**23)
    for points in [((0, 0), (2, 2), (0, 2), (2, 0)), ((0, 0), (3, 1), (1, 2), (2, -1)),
                   ((0, 0), (2, 2), (2, 2), (3, 1)), ((0, 0), (4, 0), (2, 0), (2, 1)),
                   ((0, 0), (2, 0), (2, 0), (5, 0)), ((0, 0), (4, 0), (2, 0), (6, 0)),
                   ((4, 0), (0, 0), (3, 0), (1, 0)), ((0, 0), (3, 1), (3, 1), (0, 0)),
                   ((0, 0), (1, 0), (2, 0), (3, 0)), ((0, 0), (1, 1), (0, 1), (1, 2)),
                   ((0, 0), (1, 1), (0, delta), (1, 1-delta)),
                   ((0, 0), (3, 0), (0, delta), (3, delta)),
                   ((0, 2), (0, -2), (0, 1), (0, -4))]:
        oracle.segments(points, unit="cm")
    oracle.segments(((0, 0), (2, 2), (0, 2), (2, 0)), source="0 0;2 2 | 0 2;2 0", unit="ft")


def metamorphic_cases(oracle):
    r = sp.Rational
    unit = "cm"
    rotation = sp.Matrix([[r(3, 5), r(-4, 5)], [r(4, 5), r(3, 5)]])
    scale = r(7, 3)
    shape = [(0, 0), (4, 0), (4, 4), (2, 1), (0, 4)]
    base = oracle.polygon(shape, unit=unit)
    translated = rigid(shape, rotation, (10**22, -10**22))
    assert oracle.polygon(translated, unit=unit) == base
    reflected = rigid(shape, sp.diag(-1, 1), (0, 0))
    mirror = oracle.polygon(reflected, unit=unit)
    for measure in ("area", "perimeter"):
        equivalent(mirror[measure], base[measure])
    assert mirror["orientation"] != base["orientation"]
    enlarged = rigid(shape, sp.eye(2)*scale, (0, 0))
    scaled = oracle.polygon(enlarged, unit=unit)
    equivalent(scaled["perimeter"], scale * base["perimeter"])
    equivalent(scaled["area"], scale**2 * base["area"])
    original_prism = oracle.prism(shape, 3, unit=unit)
    scaled_prism = oracle.prism(enlarged, 3*scale, unit=unit)
    for measure, value in original_prism.items():
        equivalent(scaled_prism[measure], value * scale**MEASURES[measure])

    points = [(3, 1, 2), (-2, 4, 6), (5, 9, -2)]
    spatial_rotation = sp.Matrix([[0, 0, 1], [1, 0, 0], [0, 1, 0]])
    rotated = rigid(points, spatial_rotation, (10**22, -10**22, 2))
    original_angle = oracle.angle(points, angle="rad")
    equivalent(oracle.angle(rotated, angle="rad")["angle"], original_angle["angle"])
    original_distance = oracle.distance(points[:2])["distance"]
    equivalent(oracle.distance(rotated[:2])["distance"], original_distance)
    doubled = rigid(points[:2], 2*sp.eye(3), (0, 0, 0))
    equivalent(oracle.distance(doubled)["distance"], 2*original_distance)
    crossing = [(0, 0), (3, 1), (1, 2), (2, -1)]
    transformed = rigid(crossing, rotation, (27, -3))
    base_crossing = oracle.segments(crossing)
    crossing_result = oracle.segments(transformed)
    assert crossing_result["relation"] == base_crossing["relation"]
    assert crossing_result["point"] == rigid([base_crossing["point"]], rotation, (27, -3))[0]


def failures_and_replays(oracle):
    for points in [((0, 0), (4, 4), (0, 4), (3, 0)), ((0, 0), (3, 0), (1, 0), (1, 2)),
                   ((0, 0), (4, 0), (4, 3), (2, 0), (0, 3)), ((0, 0), (1, 1), (2, 2)),
                   ((0, 0), (2, 0), (2, 2), (0, 0), (0, 2))]:
        assert not valid_polygon_reference(points), points
        oracle.reject("polygon", coordinate_source(points), "domain")
    for operation, source, code, options in [
        ("rectangle", "", "invalid_input", {}), ("rectangle", "1 0", "domain", {}),
        ("rectangle", "2 -1", "domain", {}), ("rectangle", "1 2 3", "invalid_input", {}),
        ("circle", "0", "domain", {}), ("sphere", "-2", "domain", {}),
        ("cone", "2 0", "domain", {}), ("cylinder", "0 1", "domain", {}),
        ("circle", "1/0", "domain", {}), ("triangle", "1 2 3", "domain", {}),
        ("triangle", "1 2 9", "domain", {}), ("triangle", "0 1 1", "domain", {}),
        ("distance", "0 0;1 2 3", "domain", {}), ("distance", "1;2", "domain", {}),
        ("distance", "0 0;1 1;2 2", "invalid_input", {}),
        ("angle", "0 0;0 0;1 1", "domain", {}), ("angle", "1 0;0 0;0 0", "domain", {}),
        ("segments", "0 0;0 0;0 1;1 1", "domain", {}),
        ("segments", "0 0 0;0 0 1;1 1 0;1 1 1", "domain", {}),
        ("polygon", "0 0;1 1", "domain", {}), ("polygon", "0 0;1 0;0 1|2", "invalid_input", {}),
        ("prism", "0 0;4 0;0 4|0", "domain", {}),
        ("prism", "0 0;4 0;0 4", "invalid_input", {}), ("prism", "0 0;4 0;0 4|1|2", "invalid_input", {}),
        ("circle", "3", "invalid_input", {"unit": "kg"}), ("circle", "3cm", "invalid_input", {}),
        ("angle", "1 0;0 0;0 1", "invalid_input", {"angle": "grad"}),
        ("circle", "1", "invalid_input", {"angle": "rad"}), ("circle", "2", "invalid_input", {"unit": 1}),
        ("sphere", "1", "invalid_input", {"precision": 32}),
        ("circle", "1e257", "limit", {}), ("circle", "9"*129, "limit", {}),
        ("rectangle", "1 2" + " "*4096, "limit", {}), ("circle", "1\u202e", "invalid_input", {}),
        ("circle", "__import__('os')", "invalid_input", {}), ("circle", "[1]", "invalid_input", {}),
        ("pyramid", "1 2 3", "unsupported", {}),
        ("polygon", coordinate_source([(i, i*i) for i in range(33)]), "limit", {}),
    ]:
        oracle.reject(operation, source, code, **options)
    oracle.reject("circle", "globalThis.Math.PI", "invalid_input", original="1")
    oracle.reject("circle", "1", "invalid_input", original="1\u202e")
    oracle.reject("circle", "1", "limit", original="1"*4097)
    oracle.circle(sp.Rational(3, 2), source="1.5", original="1,5 <script>display text</script>")

    oracle.replay("rectangle", " 3/2 2.50 ", unit="cm")
    oracle.replay("circle", " 1.25 ", unit="mm")
    oracle.replay("polygon", " 0 0\n3 0\n3 2\n0 0 ", unit="m")
    oracle.replay("prism", " 0 0\n3 0\n0 4 | 5/3 ", unit="ft")
    oracle.replay("angle", " 1 0 1\n0 0 0\n0 1 1 ", unit="cm", angle="rad")
    oracle.replay("segments", " 0 0;2 2 | 0 2;2 0 ", unit="m")


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: verify-geometry.py RELEASE_CLI")
    oracle = Oracle(Path(sys.argv[1]).resolve(strict=True))
    plane_cases(oracle)
    solid_cases(oracle)
    cartesian_cases(oracle)
    metamorphic_cases(oracle)
    failures_and_replays(oracle)
    print(json.dumps({"suite": "geometry-sympy", "passed": sum(oracle.checks.values()), "failed": 0,
                      "sympy": sp.__version__, "cases": dict(sorted(oracle.checks.items()))}))


if __name__ == "__main__":
    main()
