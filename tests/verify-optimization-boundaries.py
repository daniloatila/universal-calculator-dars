"""Independent boundary fixtures for Optimization and Graph Lab numerical search."""

import json
from math import isclose, pi, sqrt

from science_oracle import Oracle, arguments


def main():
    args = arguments(__doc__)
    optimization = Oracle("optimization", args.executable)
    graph = Oracle("graph-lab", args.executable)
    run = graph.run
    unit = {"lower":"0", "upper":"1"}

    out, _ = optimization.run("bisection", "x^2-0.5", options={"lower":"0", "upper":"2"})
    assert out["status"] == "converged" and isclose(out["point"][0], sqrt(0.5), abs_tol=1e-8), out
    out, _ = optimization.run("nelder_mead", "sqrt(0.001-x^2)+y^2", options={"lower":"0"})
    assert (out["status"], out["reason"]) == ("inconclusive","simplex_initialization_failed"), out

    # Equivalent exact constraints scaled by a positive rational must have the same optimum.
    for scale, bound in [("1e-12","3e-12"),("1","3"),("1e12","3e12")]:
        program = {"objective":["2","1"],"constraints":[
            {"coefficients":[scale,scale],"relation":"<=","rhs":bound},
            {"coefficients":["1","0"],"relation":"<=","rhs":"1"}],"sense":"maximize"}
        out, proof = optimization.run("linear_program",program,category="invariant_constraint_scaling")
        assert proof["exactness"]=="exact" and out["status"]=="global_optimum" and out["value_exact"]=="4",out
    program = {"objective":["1"],"constraints":[
        {"coefficients":["1"],"relation":">=","rhs":"1.00000000000000000001"},
        {"coefficients":["1"],"relation":"<=","rhs":"1"}],"sense":"minimize"}
    out, _ = optimization.run("linear_program",program,category="near_coincident_incompatible_faces")
    assert out["status"]=="infeasible",out

    data, _ = run("explicit", {"expressions":["x*(x-1)"]}, options={**unit, "find_roots":True}, category="roots_at_both_window_edges")
    assert data["roots"] == [[0,0],[0,1]], data
    data, _ = run("explicit", {"expressions":["sin(4*x)"]}, options={"lower":"-10","upper":"10","find_roots":True}, category="root_result_work_cap")
    assert len(data["roots"]) == 12 and "search_incomplete" in data["warnings"], data
    assert all(isclose(root*4/pi, round(root*4/pi), abs_tol=1e-8) for _,root in data["roots"]), data
    data, _ = run("explicit", {"expressions":["1e16*(x^2-2)"]}, options={"lower":"0","upper":"2","find_roots":True}, category="residual_unresolved_at_machine_spacing")
    assert not data["roots"] and "search_incomplete" in data["warnings"], data
    data, _ = run("explicit", {"expressions":["1e12*x"]}, options={"lower":"0","upper":"2","samples":16}, category="bounded_output_coordinate")
    assert "domain_gap" in data["warnings"] and None in data["series"][0]["points"]
    assert all(point is None or point[0] <= 1 for point in data["series"][0]["points"]), data

    data, _ = run("implicit", {"expression":"ln(x)+y"}, category="partially_defined_implicit_field")
    vertices = [point for point in data["series"][0]["points"] if point is not None]
    assert vertices and all(x > 0.0 for x,_ in vertices), data
    data, _ = run("implicit", {"expression":"sin(4*x)*sin(4*y)"}, options={"samples":32}, category="partial_contour_budget")
    assert "partial_contour" in data["warnings"], data
    assert len(data["series"][0]["points"]) >= 720, len(data["series"][0]["points"])
    data, _ = run("implicit", {"expression":"x*y-0.0001"}, options={"lower":"-1","upper":"1","y_lower":"-1","y_upper":"1","samples":16}, category="negative_center_ambiguous_cell")
    cell = [point for point in data["series"][0]["points"] if point is not None and max(map(abs,point)) < 0.067]
    assert any(x > 0 and y > 0 for x,y in cell) and any(x < 0 and y < 0 for x,y in cell), cell

    run("surface", {"expression":"x"}, options={"find_roots":True}, error="invalid_input", category="unsupported_graph_option")
    run("surface", {"expression":"x"+" "*256}, error="limit", category="expression_byte_limit")
    run("unknown_algorithm", {"expression":"x"}, error="unsupported", category="unsupported_graph_operation")

    optimization_summary = optimization.finish(None, ["Analytic square root, simplex initialization, exact feasibility and positive constraint scaling"],
                                               suite="optimization-boundaries")
    graph_summary = graph.finish(None, ["Analytic grid endpoints, phase multiples, model-domain and work-limit checks"],
                                 suite="graph-lab-boundaries")
    if args.report:
        args.report.write_text(json.dumps({"schema":1,"reports":[optimization_summary,graph_summary]}, indent=2)+"\n",
                               encoding="utf-8")


if __name__ == "__main__":
    main()
