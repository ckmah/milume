import sys, types
m = types.ModuleType("milume"); m.__path__ = ["/workspace/milume-mesh/milume"]; sys.modules["milume"] = m
