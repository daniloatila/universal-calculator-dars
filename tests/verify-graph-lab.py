"""Verify Graph Lab samples, geometry, gap boundaries, and search invariance."""

from math import cos, isclose, pi, sin, sqrt

from science_oracle import Oracle, arguments


def close(left, right, tolerance=1e-12):
    assert isclose(left,right,rel_tol=tolerance,abs_tol=tolerance), (left,right,tolerance)


def main():
    args = arguments(__doc__)
    oracle = Oracle("graph-lab", args.executable)
    run = oracle.run
    source = {"expressions":["x^2-2","0"]}
    search = {"lower":"-2","upper":"2","samples":32,"find_roots":True,"find_intersections":True}
    plot, proof = run("explicit",source,options=search)
    assert plot["kind"] == "explicit" and plot["grid"] is None and proof["tolerance"] == "0.00000001"
    for point in plot["series"][0]["points"]:
        assert point is not None
        close(point[1],point[0]**2-2)
    for i, root in enumerate([-sqrt(2),sqrt(2)]):
        assert plot["roots"][i][0] == 0
        assert plot["intersections"][i][:2] == [0,1]
        close(plot["roots"][i][1],root,3e-9)
        close(plot["intersections"][i][2],root,3e-9)
    assert "flat_zero_function" in plot["warnings"]
    refined, _ = run("explicit",source,options={**search,"samples":256},category="numerical_search_visual_invariance")
    assert refined["roots"] == plot["roots"] and refined["intersections"] == plot["intersections"]
    assert len(refined["series"][0]["points"]) == 256

    for expression, pole, window in [("1/(x-0.013)",0.013,(-1,1)),("tan(x)",pi/2,(1,2)),("1/(x^2)",0,(-1,1))]:
        lower, upper = window
        plot,_ = run("explicit",{"expressions":[expression]},options={**search,"lower":str(lower),"upper":str(upper)},category="discontinuities")
        points = plot["series"][0]["points"]
        assert "domain_gap" in plot["warnings"] and None in points and not plot["roots"],plot
        assert all(left is None or right is None or not left[0] < pole < right[0] for left,right in zip(points,points[1:])),points
    plot,_ = run("explicit",{"expressions":["sin(1000*x)"]},options={"samples":16},category="undersampling")
    assert "resolution_insufficient" in plot["warnings"] and None in plot["series"][0]["points"]
    plot,_ = run("explicit",{"expressions":["1e16+x-1e16"]},options={"find_roots":True},category="roundoff_unresolved")
    assert "search_incomplete" in plot["warnings"] and not plot["roots"], plot
    plot,_ = run("explicit",{"expressions":["sqrt(1-x^2)"]},options={"lower":"-2","upper":"2","samples":65},category="partial_domain")
    for point in plot["series"][0]["points"]:
        if point is not None:
            assert -1 <= point[0] <= 1
            close(point[1],sqrt(1-point[0]**2))
    plot,_ = run("explicit",{"expressions":["a*sin(x)+b+c*x","a*sin(x)+b+c*x"]},options={"a":"3","b":"2","c":"-0.5","find_intersections":True},category="parameters_and_coincidence")
    assert "coincident_curves" in plot["warnings"] and not plot["intersections"]
    for x,y in plot["series"][0]["points"]:
        close(y,3*sin(x)+2-0.5*x)

    plot,_ = run("parametric",{"x":"cos(t)","y":"sin(t)"},options={"lower":"0","upper":"6.283185307179586","samples":64})
    assert not plot["warnings"]
    for x,y in plot["series"][0]["points"]:
        close(x*x+y*y,1)
    for a,b in zip(plot["series"][0]["points"][0],plot["series"][0]["points"][-1]):
        close(a,b)
    plot,_ = run("polar",{"r":"2"},options={"lower":"0","upper":"6.283185307179586","samples":64})
    for x,y in plot["series"][0]["points"]:
        close(x*x+y*y,4)
    plot,_ = run("polar",{"r":"2"},options={"lower":"0","upper":"100","samples":16},category="undersampled_polar")
    assert "resolution_insufficient" in plot["warnings"] and None in plot["series"][0]["points"]

    plot,_ = run("implicit",{"expression":"x^2+y^2-1"},options={"lower":"-1.2","upper":"1.2","y_lower":"-1.2","y_upper":"1.2","samples":32})
    points = plot["series"][0]["points"]
    assert len(points) > 40 and len(points)%3 == 0
    for a,b,gap in zip(points[::3],points[1::3],points[2::3]):
        assert gap is None
        for x,y in (a,b):
            close(x*x+y*y,1,2e-3)
    plot,_ = run("implicit",{"expression":"x*y"},options={"lower":"-1","upper":"1","y_lower":"-1","y_upper":"1","samples":16},category="saddle_cell")
    assert any(point is not None for point in plot["series"][0]["points"])
    plot,_ = run("implicit",{"expression":"0"},category="flat_field")
    assert "flat_contour" in plot["warnings"] and plot["series"][0]["points"] == []
    plot,_ = run("implicit",{"expression":"1/(x-0.02)"},category="implicit_discontinuity")
    assert "domain_gap" in plot["warnings"] and plot["series"][0]["points"] == []

    plot,_ = run("surface",{"expression":"sin(x)*cos(y)"},options={"samples":32})
    grid = plot["grid"]
    assert len(grid["x"]) == len(grid["y"]) == len(grid["z"]) == 32 and plot["series"] == []
    for y,row in zip(grid["y"],grid["z"]):
        assert len(row) == 32
        for x,z in zip(grid["x"],row):
            close(z,sin(x)*cos(y))
    plot,_ = run("surface",{"expression":"1/(x-y)"},category="surface_hole")
    grid = plot["grid"]
    assert "domain_gap" in plot["warnings"]
    assert all(row[i] is None for i,row in enumerate(grid["z"]))
    assert any(z is not None for row in grid["z"] for z in row)
    plot,_ = run("space_curve",{"x":"cos(t)","y":"sin(t)","z":"t"},options={"samples":96})
    for x,y,z in plot["series"][0]["points"]:
        close(x,cos(z)); close(y,sin(z))
    assert plot["grid"] is None

    run("explicit",{"expressions":["y"]},error="invalid_input",category="invalid_inputs")
    run("explicit",{"expressions":["Math.sin(x)"]},error="unsupported",category="invalid_inputs")
    run("explicit",{"expressions":["x"]*4},options={"samples":256},error="limit",category="invalid_inputs")
    run("surface",{"expression":"x"},options={"samples":33},error="limit",category="invalid_inputs")
    run("surface",{"expression":"x"},options={"lower":"2","upper":"1"},error="domain",category="invalid_inputs")
    run("parametric",'{"x":"t","x":"t^2","y":"t"}',error="invalid_input",category="invalid_inputs")
    oracle.finish(args.report, ["Closed-form geometry and Python math sample checks", "Fixed independent invariance and domain fixtures"])


if __name__ == "__main__":
    main()
