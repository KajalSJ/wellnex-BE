import AuditLog from "../models/audit.log.model.js";

const createAuditLog = async (logData) => {
  try {
    const auditLog = new AuditLog({
      ...logData,
      createdAt: new Date()
    });
    await auditLog.save();
    return auditLog;
  } catch (error) {
    console.error("Failed to create audit log:", error);
    // Don't throw error as audit logging should not block the main operation
    return null;
  }
};

export default createAuditLog; 