export default class RequireSelectedTests {
  onTestRunEnd(testModules) {
    const tests = [];
    for (const testModule of testModules ?? []) {
      for (const testCase of testModule.children.allTests()) tests.push(testCase);
    }
    const focused = tests.some((testCase) => testCase.options.mode === "only");
    const skipped = tests.some((testCase) => {
      const mode = testCase.options.mode;
      return mode === "skip" || mode === "todo" || testCase.result().state === "skipped";
    });
    if (tests.length > 0 && !focused && !skipped) return;
    const reason = tests.length === 0 ? "empty" : focused ? "focused" : "skipped";
    throw new Error(`required selected tests rejected: ${reason}`);
  }
}
