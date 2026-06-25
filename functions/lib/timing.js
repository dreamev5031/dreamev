export function createStepTimer(requestId) {
  const startedAt = Date.now();
  let lastAt = startedAt;
  const steps = {};

  return {
    mark(name) {
      const now = Date.now();
      steps[name] = now - lastAt;
      lastAt = now;
    },
    summary() {
      return { ...steps, total: Date.now() - startedAt, requestId };
    },
    log(label = 'operation timing') {
      console.info(label, this.summary());
    },
  };
}
