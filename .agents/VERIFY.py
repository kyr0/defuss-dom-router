"""Required web checks fail closed: lint, tests, merged bundle coverage and the browser suite."""
CONFIG = {
    "coverage_min": 60,
    "lint_command": None, "test_command": None, "coverage_command": None,
    "integration_commands": [], "e2e_commands": [],
    "timeout_s": 240, "layout": True, "toolchain": True,
}
RULES = [
    {"id":"routing.boundaries", "kind":"command", "command":"python3 tools/policy.py", "claim":"router sources and the shipped bundle import no other module, framework or runtime"},
    {"id":"tests.no-mocks", "kind":"not_regex", "glob":"*", "pattern":r"unittest\.mock|MagicMock\(|jest\.(?:mock|fn|spyOn)\(|vi\.(?:mock|fn|spyOn)\(|sinon\.", "claim":"real subsystems and pure functions, not mock frameworks"},
]
