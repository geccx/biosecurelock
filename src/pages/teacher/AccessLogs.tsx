import { useEffect, useState } from "react";
import { Card } from "../../components/common/Card";
import { Badge } from "../../components/common/Badge";
import { Table } from "../../components/common/Table";
import { logsService } from "../../services";

interface AccessLogsProps {
  teacherId: string;
}

interface UnifiedLogDisplay {
  id: string;
  logType: "door_access" | "login" | "logout" | "schedule_request";
  eventType: string;
  details: string;
  timestamp: Date;
  blockchainHash?: string;
  accessMethod?: string;
  success?: boolean;
  labName?: string;
  laboratory?: string | null;
  userRole?: string | null;
  subject?: string | null;
  result?: "Granted" | "Denied";
  reasonForDenial?: string | null;
}

export function AccessLogs({ teacherId }: AccessLogsProps) {
  const [logs, setLogs] = useState<UnifiedLogDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLogs();
  }, [teacherId]);

  const fetchLogs = async () => {
    try {
      const teacherIdNum = parseInt(teacherId);
      
      if (isNaN(teacherIdNum)) {
        console.error("Invalid teacherId:", teacherId);
        setLoading(false);
        return;
      }

      console.log("Fetching logs for teacherId:", teacherIdNum);
      
      // Fetch both access logs and system logs in parallel
      const [accessLogsRes, systemLogsRes] = await Promise.all([
        logsService.getAccessLogs({
          userId: teacherIdNum,
          limit: 100,
        }).catch((err) => {
          console.error("Error fetching access logs:", err);
          return { success: false, data: null, error: err.message };
        }),
        logsService.getSystemLogs({
          userId: teacherIdNum,
          limit: 100,
        }).catch((err) => {
          console.error("Error fetching system logs:", err);
          return { success: false, data: null, error: err.message };
        }),
      ]);

      console.log("Access logs response:", accessLogsRes);
      console.log("System logs response:", systemLogsRes);

      const unifiedLogs: UnifiedLogDisplay[] = [];

      // Process access logs (door lock access events)
      if (accessLogsRes && accessLogsRes.success && accessLogsRes.data) {
        console.log("Processing access logs, count:", accessLogsRes.data.length);
        accessLogsRes.data.forEach((log: any) => {
          try {
            // Handle different field name variations
            const timestamp = log.timestamp || log.accessed_at || log.created_at;
            const accessMethod = log.accessMethod || log.access_method || "unknown";
            const success = log.success !== undefined ? Boolean(log.success) : true;
            const blockchainHash = log.blockchainHash || log.blockchain_hash || log.fabric_tx_id || log.fabricTxId;
            const labName = log.labName || log.lab_name || log.laboratory_name;

            if (!timestamp) {
              console.warn("Access log missing timestamp:", log);
              return;
            }

            unifiedLogs.push({
              id: `access-${log.id}`,
              logType: "door_access",
              eventType: accessMethod,
              details: `Door ${success ? "unlocked" : "access denied"} via ${accessMethod}`,
              timestamp: new Date(timestamp),
              blockchainHash,
              accessMethod: log.accessMethod || accessMethod,
              success,
              labName: log.laboratory || labName,
              userRole: log.role || null,
              subject: log.subject || null,
              laboratory: log.laboratory || null,
              result: log.result || (success ? "Granted" : "Denied"),
              reasonForDenial: log.reasonForDenial || null,
            });
          } catch (err) {
            console.error("Error processing access log:", err, log);
          }
        });
      } else {
        console.warn("Access logs not available:", {
          success: accessLogsRes?.success,
          hasData: !!accessLogsRes?.data,
          error: accessLogsRes?.error,
        });
      }

      // Process system logs (login, logout, schedule requests)
      if (systemLogsRes && systemLogsRes.success && systemLogsRes.data) {
        console.log("Processing system logs, count:", systemLogsRes.data.length);
        systemLogsRes.data.forEach((log: any) => {
          try {
            const eventType = log.eventType || log.event_type || "unknown";
            let logType: UnifiedLogDisplay["logType"] = "door_access";
            
            // Categorize by event type
            if (eventType === "login" || eventType.toLowerCase().includes("login")) {
              logType = "login";
            } else if (eventType === "logout" || eventType.toLowerCase().includes("logout")) {
              logType = "logout";
            } else if (
              eventType.toLowerCase().includes("schedule") ||
              eventType.toLowerCase().includes("move_request") ||
              eventType.toLowerCase().includes("move request") ||
              (eventType.toLowerCase().includes("request") && 
               !eventType.toLowerCase().includes("password") &&
               !eventType.toLowerCase().includes("pin"))
            ) {
              logType = "schedule_request";
            }

            // Format details
            let details = "";
            if (log.details) {
              if (typeof log.details === "string") {
                details = log.details;
              } else if (typeof log.details === "object") {
                // Try to extract meaningful information from metadata
                const metadata = log.details;
                if (metadata.eventDescription) {
                  details = metadata.eventDescription;
                } else if (metadata.details) {
                  details = typeof metadata.details === "string" 
                    ? metadata.details 
                    : JSON.stringify(metadata.details);
                } else if (log.eventDescription || log.event_description) {
                  details = log.eventDescription || log.event_description;
                } else {
                  details = JSON.stringify(metadata);
                }
              } else {
                details = String(log.details);
              }
            } else if (log.eventDescription || log.event_description) {
              details = log.eventDescription || log.event_description;
            } else {
              details = `${eventType} event`;
            }

            // Handle different field name variations
            const timestamp = log.timestamp || log.created_at;
            if (!timestamp) {
              console.warn("System log missing timestamp:", log);
              return;
            }

            const blockchainHash = log.blockchainHash || log.blockchain_hash || log.fabric_tx_id || log.fabricTxId;

            unifiedLogs.push({
              id: `system-${log.id}`,
              logType,
              eventType,
              details,
              timestamp: new Date(timestamp),
              blockchainHash,
              userRole: log.role || (log.details && typeof log.details === 'object' ? (log.details.role as string) || (log.details.userLevel as string) : null) || null,
            });
          } catch (err) {
            console.error("Error processing system log:", err, log);
          }
        });
      } else {
        console.warn("System logs not available:", {
          success: systemLogsRes?.success,
          hasData: !!systemLogsRes?.data,
          error: systemLogsRes?.error,
        });
      }

      console.log("Total unified logs:", unifiedLogs.length);

      // Sort by timestamp (newest first)
      unifiedLogs.sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
      );

      setLogs(unifiedLogs);
      setError(null);
    } catch (error: any) {
      console.error("Failed to fetch logs:", error);
      const errorMessage = error?.response?.data?.error || error?.message || "Failed to fetch logs. Please try again.";
      setError(errorMessage);
      // Set empty logs on error so UI shows error message
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const getLogTypeLabel = (log: UnifiedLogDisplay) => {
    switch (log.logType) {
      case "door_access":
        return log.success
          ? `Door Unlocked (${log.accessMethod || "unknown"})`
          : `Access Denied (${log.accessMethod || "unknown"})`;
      case "login":
        return "Login";
      case "logout":
        return "Logout";
      case "schedule_request":
        const eventType = log.eventType.toLowerCase();
        if (eventType.includes("schedule_created") || eventType.includes("schedule created")) {
          return "Schedule Request Created";
        } else if (eventType.includes("schedule_updated") || eventType.includes("schedule updated")) {
          return "Schedule Request Updated";
        } else if (eventType.includes("schedule_deleted") || eventType.includes("schedule deleted")) {
          return "Schedule Request Deleted";
        } else if (eventType.includes("move_request") || eventType.includes("move request")) {
          return "Schedule Move Request";
        }
        return "Schedule Request";
      default:
        return log.eventType;
    }
  };

  const getLogTypeVariant = (log: UnifiedLogDisplay) => {
    switch (log.logType) {
      case "door_access":
        return log.success ? "success" : "danger";
      case "login":
        return "success";
      case "logout":
        return "info";
      case "schedule_request":
        return "info";
      default:
        return "secondary";
    }
  };

  const getLogTypeIcon = (logType: UnifiedLogDisplay["logType"]) => {
    switch (logType) {
      case "door_access":
        return "🔓";
      case "login":
        return "🔑";
      case "logout":
        return "🚪";
      case "schedule_request":
        return "📅";
      default:
        return "📋";
    }
  };

  const columns = [
    {
      header: "Date and Time",
      accessor: (log: UnifiedLogDisplay) => (
        <div className="text-sm">
          <div className="font-medium text-gray-900">
            {log.timestamp.toLocaleDateString()}
          </div>
          <div className="text-gray-500">
            {log.timestamp.toLocaleTimeString()}
          </div>
        </div>
      ),
    },
    {
      header: "Type",
      accessor: (log: UnifiedLogDisplay) => (
        <div className="flex items-center gap-2">
          <span className="text-lg">{getLogTypeIcon(log.logType)}</span>
          <Badge variant={getLogTypeVariant(log)}>
            {getLogTypeLabel(log)}
          </Badge>
        </div>
      ),
    },
    {
      header: "Role",
      accessor: (log: UnifiedLogDisplay) => (
        log.userRole ? (
          <Badge variant="info" className="text-xs">
            {log.userRole}
          </Badge>
        ) : (
          <span className="text-gray-400 text-sm">N/A</span>
        )
      ),
    },
    {
      header: "Subject",
      accessor: (log: UnifiedLogDisplay) => (
        <span className="text-sm text-gray-700">
          {log.subject || "N/A"}
        </span>
      ),
    },
    {
      header: "Laboratory",
      accessor: (log: UnifiedLogDisplay) => (
        <span className="text-sm text-gray-700">
          {log.laboratory || log.labName || "N/A"}
        </span>
      ),
    },
    {
      header: "Access Method",
      accessor: (log: UnifiedLogDisplay) => (
        log.accessMethod ? (
          <Badge variant="info" className="text-xs">
            {log.accessMethod}
          </Badge>
        ) : (
          <span className="text-gray-400 text-sm">N/A</span>
        )
      ),
    },
    {
      header: "Result",
      accessor: (log: UnifiedLogDisplay) => {
        const result = log.result || (log.success ? "Granted" : "Denied");
        return (
          <Badge variant={result === "Granted" ? "success" : "danger"}>
            {result}
          </Badge>
        );
      },
    },
    {
      header: "Reason for Denial",
      accessor: (log: UnifiedLogDisplay) => (
        log.reasonForDenial ? (
          <span className="text-sm text-red-600 italic">
            {log.reasonForDenial}
          </span>
        ) : (
          <span className="text-gray-400 text-sm">—</span>
        )
      ),
    },
    {
      header: "Blockchain Hash",
      accessor: (log: UnifiedLogDisplay) =>
        log.blockchainHash ? (
          <code className="text-xs bg-gray-100 px-2 py-1 rounded">
            {log.blockchainHash.substring(0, 12)}...
          </code>
        ) : (
          <span className="text-gray-400">N/A</span>
        ),
    },
  ];

  // Count logs by type
  const doorAccessCount = logs.filter((l) => l.logType === "door_access").length;
  const loginCount = logs.filter((l) => l.logType === "login").length;
  const logoutCount = logs.filter((l) => l.logType === "logout").length;
  const scheduleRequestCount = logs.filter(
    (l) => l.logType === "schedule_request"
  ).length;

  return (
    <div className="space-y-6">
      <Card title="My Access Logs">
        <p className="text-sm text-gray-600 mb-4">
          This log shows all your activities including door lock access events,
          login/logout events, and schedule request actions.
        </p>

        {/* Summary Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-xs text-blue-600 font-medium">Door Access</p>
            <p className="text-2xl font-bold text-blue-900">{doorAccessCount}</p>
          </div>
          <div className="p-3 bg-green-50 rounded-lg border border-green-200">
            <p className="text-xs text-green-600 font-medium">Login Events</p>
            <p className="text-2xl font-bold text-green-900">{loginCount}</p>
          </div>
          <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
            <p className="text-xs text-purple-600 font-medium">Logout Events</p>
            <p className="text-2xl font-bold text-purple-900">{logoutCount}</p>
          </div>
          <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
            <p className="text-xs text-orange-600 font-medium">
              Schedule Requests
            </p>
            <p className="text-2xl font-bold text-orange-900">
              {scheduleRequestCount}
            </p>
          </div>
        </div>

        {error ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 font-medium">Error loading logs</p>
            <p className="text-red-600 text-sm mt-1">{error}</p>
            <button
              onClick={() => {
                setError(null);
                fetchLogs();
              }}
              className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
            >
              Retry
            </button>
          </div>
        ) : logs.length > 0 ? (
          <Table data={logs} columns={columns} />
        ) : (
          <p className="text-center text-gray-500 py-8">No activity logs found</p>
        )}
      </Card>
    </div>
  );
}
