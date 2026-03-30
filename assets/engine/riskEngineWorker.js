'use strict';

importScripts('riskEngine.js');

(function attachRiskEngineWorker(workerScope) {
  function serialiseError(error) {
    return {
      message: String(error?.message || 'Simulation failed.'),
      code: String(error?.code || 'SIMULATION_WORKER_ERROR'),
      validation: error?.validation && typeof error.validation === 'object'
        ? error.validation
        : null
    };
  }

  workerScope.addEventListener('message', async event => {
    const data = event?.data && typeof event.data === 'object' ? event.data : {};
    if (data.type !== 'RUN_SIMULATION') return;

    try {
      const payload = data.payload && typeof data.payload === 'object' ? data.payload : {};
      const iterations = Math.max(
        1,
        Number.parseInt(payload.iterations, 10) || RiskEngine.constants.DEFAULT_ITERATIONS
      );
      const yieldEvery = Math.max(1, Math.ceil(iterations / 10));
      let lastReportedPercent = 0;

      const result = await RiskEngine.runAsync(payload, {
        yieldEvery,
        onProgress: (ratio = 0) => {
          const currentPercent = Math.max(0, Math.min(100, Math.floor((Number(ratio) || 0) * 100)));
          const alignedPercent = Math.min(100, Math.floor(currentPercent / 10) * 10);
          if (alignedPercent < 10 || alignedPercent <= lastReportedPercent) return;
          lastReportedPercent = alignedPercent;
          workerScope.postMessage({
            type: 'PROGRESS',
            percent: alignedPercent
          });
        }
      });

      if (lastReportedPercent < 100) {
        workerScope.postMessage({
          type: 'PROGRESS',
          percent: 100
        });
      }

      workerScope.postMessage({
        type: 'RESULT',
        result
      });
    } catch (error) {
      workerScope.postMessage({
        type: 'ERROR',
        error: serialiseError(error)
      });
    }
  });
})(self);
