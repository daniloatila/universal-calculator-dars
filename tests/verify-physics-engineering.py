"""Fraction-based verification of Physics & Engineering and its unit contracts."""

from fractions import Fraction as F
from math import hypot, isclose, tau

from science_oracle import Oracle, arguments


def main():
    args = arguments(__doc__)
    oracle = Oracle("physics-engineering", args.executable)
    def exact(operation, inputs, expected, units=None, category=None):
        request = {name: [str(x) for x in value] if isinstance(value, list) else str(value) for name,value in inputs.items()}
        if units is not None:
            request["units"] = units
        result, proof = oracle.run(operation, request, category=category)
        assert proof["exactness"] == "exact" and proof["precision"] is None, proof
        assert set(result["values"]) == set(expected), result
        for name,(value,unit) in expected.items():
            pair = result["values"][name]
            assert (F(pair["value"]), pair["unit"], proof["units"][name]) == (F(value),unit,unit), (request, result)
        return proof

    g = F("9.80665")
    exact("uniform_motion", {"initial_position": 1, "velocity": -2, "time": 3}, {"position":(-5,"m"),"final_velocity":(-2,"m/s")})
    exact("accelerated_motion", {"initial_position": 1, "initial_velocity": 2, "acceleration": 3, "time": 4},
          {"position":(33,"m"),"final_velocity":(14,"m/s")})
    exact("force", {"mass": 5,"acceleration":-3}, {"net_force":(-15,"N")})
    exact("work", {"force":-20,"displacement":5}, {"work":(-100,"J")})
    exact("energy", {"mass":4,"speed":3,"height":5}, {"kinetic_energy":(18,"J"),"potential_energy":(20*g,"J"),"mechanical_energy":(18+20*g,"J")})
    exact("power", {"work":7,"time":3}, {"average_power":("7/3","W")})
    exact("momentum", {"mass":5,"velocity":-3}, {"momentum":(-15,"kg*m/s")})
    exact("impulse", {"force":5,"time":3}, {"impulse":(15,"N*s")})
    exact("circular_motion", {"mass":2,"speed":3,"radius":2}, {"angular_speed":("3/2","rad/s"),"centripetal_acceleration":("9/2","m/s^2"),"centripetal_force":(9,"N")})
    result, proof = oracle.run("gravitation", {"mass_a":"1000000","mass_b":"5","distance":"10"})
    assert proof["exactness"] == "approximate" and proof["precision"] == 6
    assert proof["variables"]["G_standard_uncertainty"] == "1.5e-15" and "CODATA 2022" in " ".join(proof["constraints"])
    assert F(result["values"]["force"]["value"]) == F("6.67430e-11") * 50_000
    assert F(result["values"]["standard_uncertainty"]["value"]) == F("1.5e-15") * 50_000
    exact("ohm", {"voltage":12,"resistance":6}, {"current":(2,"A"),"power":(24,"W")})
    proof = exact("ohm", {"voltage":12000,"resistance":"0.006"}, {"current":(2,"A"),"power":(24,"W")},
                  {"voltage":"mV","resistance":"kΩ"}, "unit_invariance")
    assert proof["units"]["voltage"] == "V" and proof["variables"]["voltage"] == "12"
    exact("electrical_power", {"voltage":12,"current":2}, {"power":(24,"W")})
    exact("electrical_energy", {"power":24,"time":2}, {"energy":(172800,"J")}, {"time":"h"})
    exact("resistors_series", {"resistances":[3,6,9]}, {"equivalent_resistance":(18,"ohm")})
    exact("resistors_parallel", {"resistances":[3,6,9]}, {"equivalent_resistance":("18/11","ohm")})
    exact("resistors_parallel", {"resistances":[3,0,9]}, {"equivalent_resistance":(0,"ohm")}, category="zero_resistance_short")
    exact("capacitance", {"capacitance":1,"voltage":12}, {"charge":("3/250","C"),"energy":("9/125","J")}, {"capacitance":"mF"})
    exact("inductance", {"inductance":"0.1","current":3}, {"flux_linkage":("3/10","Wb"),"energy":("9/20","J")})
    result, proof = oracle.run("rlc_series", {"resistance":"12","inductance":"0.1","capacitance":"0.01","frequency":"60"})
    reactance = tau*60*0.1 - 1/(tau*60*0.01)
    assert proof["exactness"] == "approximate"
    assert isclose(float(result["values"]["reactance"]["value"]),reactance,rel_tol=1e-13)
    assert isclose(float(result["values"]["impedance_magnitude"]["value"]),hypot(12,reactance),rel_tol=1e-13)
    exact("temperature", {"temperature":32}, {"kelvin":("273.15","K"),"celsius":(0,"degC"),"fahrenheit":(32,"degF")}, {"temperature":"degF"})
    exact("heat", {"mass":2,"specific_heat":4184,"temperature_change":18}, {"heat":(83680,"J")}, {"temperature_change":"delta_degF"})
    exact("heat_conduction", {"conductivity":2,"area":3,"temperature_change":-10,"thickness":"0.1"}, {"heat_rate":(-600,"W")})
    r = F("1.380649e-23")*F("6.02214076e23")
    proof = exact("ideal_gas", {"amount":2,"temperature":300,"volume":1}, {"pressure":(600*r,"Pa")})
    assert F(proof["variables"]["molar_gas_constant"]) == r
    exact("pressure", {"force":2,"area":4}, {"pressure":(500,"Pa")}, {"force":"kN"})
    exact("thermodynamic_work", {"pressure":100,"volume_change":"-0.2"}, {"work":(-20000,"J")}, {"pressure":"kPa"})
    exact("efficiency", {"useful_energy":75,"input_energy":100}, {"efficiency":("3/4","1"),"efficiency_percent":(75,"%")})
    exact("density", {"mass":2,"volume":2}, {"density":(1000,"kg/m^3")}, {"volume":"L"})
    exact("hydrostatic_pressure", {"density":1,"depth":3}, {"gauge_pressure":(3000*g,"Pa")}, {"density":"g/cm^3"})
    exact("buoyancy", {"density":1000,"volume":"0.5"}, {"buoyant_force":(500*g,"N")})
    exact("flow_rate", {"area":"0.2","speed":3}, {"volume_flow":("3/5","m^3/s")})
    exact("continuity", {"area_a":"0.2","speed_a":3,"area_b":"0.4"}, {"volume_flow":("3/5","m^3/s"),"speed_b":("3/2","m/s")})
    exact("bernoulli", {"density":1000,"pressure_a":100000,"speed_a":3,"height_a":2,"speed_b":2,"height_b":5}, {"pressure_b":(102500-3000*g,"Pa")})
    exact("stress_strain", {"force":1000,"area":"0.1","length":3,"length_change":"0.01"}, {"normal_stress":(10000,"Pa"),"engineering_strain":("1/300","1")})
    exact("elasticity", {"modulus":200000000000,"strain":"0.001"}, {"normal_stress":(200000000,"Pa")})
    exact("torque", {"force":30,"lever_arm":20}, {"torque":(6,"N*m")}, {"lever_arm":"cm"})
    exact("wave", {"wavelength":"0.5","frequency":20}, {"phase_speed":(10,"m/s"),"period":("1/20","s")})
    for name,data,code in [
        ("ohm", {"voltage":"12","resistance":"6","units":{"resistance":"kg"}}, "domain"),
        ("ohm", {"voltage":"12","resistance":"0"}, "domain"),
        ("temperature", {"temperature":"-274","units":{"temperature":"degC"}}, "domain"),
        ("heat", {"mass":"2","specific_heat":"4184","temperature_change":"18","units":{"temperature_change":"degF"}}, "domain"),
        ("efficiency", {"useful_energy":"6","input_energy":"5"}, "domain"),
        ("stress_strain", {"force":"10","area":"1","length":"3","length_change":"-3"}, "domain"),
        ("ohm", '{"voltage":"12","resistance":"6","units":{"resistance":"kg","resistance":"ohm"}}', "invalid_input"),
        ("ohm", '{"voltage":"12","voltage":"13","resistance":"6"}', "invalid_input"),
        ("ohm", {"voltage":"12","resistance":"6","extra":"1"}, "invalid_input"),
        ("resistors_parallel", {"resistances":["1"]*33}, "limit"),
    ]:
        oracle.run(name, data, error=code, category="adversarial_inputs")
    oracle.finish(args.report, ["Python Fraction and independently evaluated elementary equations", "BIPM SI Brochure 9th edition", "NIST CODATA 2022 coefficients"])


if __name__ == "__main__":
    main()
