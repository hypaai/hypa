if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const {
    OTLPTraceExporter,
  } = require('@opentelemetry/exporter-trace-otlp-http');
  const {
    HttpInstrumentation,
  } = require('@opentelemetry/instrumentation-http');
  const {
    ExpressInstrumentation,
  } = require('@opentelemetry/instrumentation-express');
  const {
    NestInstrumentation,
  } = require('@opentelemetry/instrumentation-nestjs-core');

  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'hypa-api',
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      new NestInstrumentation(),
    ],
  });

  sdk.start();
  process.once('SIGTERM', () => void sdk.shutdown());
}
