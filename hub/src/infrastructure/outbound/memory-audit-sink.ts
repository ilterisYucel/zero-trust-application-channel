import type {
  IAuditSink,
  SessionAuditCloseRecord,
  SessionAuditOpenRecord,
} from "zero-trust-application-channel";

/**
 * MemoryAuditSink — no-op audit adapter'ı.
 *
 * Tamper-evidence otoritesi kaynak tarafların kendi log zincirindedir; hub
 * audit'i ihtiyaç olursa aynı porta kalıcı adapter eklenir.
 */
export class MemoryAuditSink implements IAuditSink {
  async open(_record: SessionAuditOpenRecord): Promise<void> {}
  async close(_record: SessionAuditCloseRecord): Promise<void> {}
}
