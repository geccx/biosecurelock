import { useEffect, useState } from "react";
import { ShieldCheckIcon, DatabaseIcon } from "lucide-react";
import { Card } from "../../components/common/Card";
import { Badge } from "../../components/common/Badge";
import { Table } from "../../components/common/Table";
import { logsService } from "../../services";
import "../../styles/AdminAccess.css";

interface LogDisplay {
  id: string;
  userName: string;
  userRole: string | null;
  subject?: string | null;
  laboratory?: string | null;
  labName: string;
  timestamp: Date;
  dateTime?: Date | string;
  accessMethod?: string;
  blockchainHash: string;
  status: "granted" | "denied";
  result?: "Granted" | "Denied";
  reasonForDenial?: string | null;
  source?: "system" | "tuya";
  unlockMethod?: string;
  unlockValue?: string | number | object;
  avatar?: string;
  mediaInfos?: Array<{
    file_key: string;
    file_url: string;
    media_url?: string;
    media_key?: string;
  }>;
}

interface SystemLogDisplay {
  id: string;
  type: string;
  activityType: string;
  userId: string;
  username: string;
  role: string | null;
  timestamp: Date;
  txId: string | null;
  details: Record<string, unknown>;
  eventType: string;
  eventDescription: string | null;
}

export function AdminAccessLogs() {
  const [logs, setLogs] = useState<LogDisplay[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemLogDisplay[]>([]);
  const [activeTab, setActiveTab] = useState<"access" | "activities">(
    "access"
  );
  const [loading, setLoading] = useState(true);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [tuyaLoading, setTuyaLoading] = useState(false);

  useEffect(() => {
    const loadAllData = async () => {
      await Promise.all([
        fetchData(),
        fetchSystemLogs(),
        fetchTuyaUnlockingHistory(),
      ]);
    };
    loadAllData();
  }, []);

  const fetchData = async () => {
    try {
      const logsRes = await logsService.getAccessLogs({ limit: 50 });

      if (logsRes.success && logsRes.data) {
        const systemLogs = logsRes.data
          .filter((log) => log.blockchainHash)
          .map((log) => ({
            id: log.id.toString(),
            userName: log.userName || log.username || "Unknown",
            userRole: log.role || null,
            subject: log.subject || null,
            laboratory: log.laboratory || null,
            labName: log.laboratory || "Laboratory",
            timestamp: new Date(log.timestamp),
            dateTime: log.dateTime ? new Date(log.dateTime) : new Date(log.timestamp),
            accessMethod: log.accessMethod || "Unknown",
            blockchainHash: log.blockchainHash || "",
            status: log.success ? "granted" : "denied",
            result: log.result || (log.success ? "Granted" : "Denied"),
            reasonForDenial: log.reasonForDenial || null,
            source: "system" as const,
          }));
        
        setLogs(systemLogs);
      }
    } catch (error) {
      console.error("Failed to fetch access logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSystemLogs = async () => {
    setActivitiesLoading(true);
    try {
      const response = await logsService.getSystemLogs({ limit: 100 });
      if (response.success && response.data) {
        setSystemLogs(
          response.data.map((log) => {
            // Extract eventDescription from details if it exists
            const details = log.details || {};
            const eventDescription =
              (details.eventDescription as string) ||
              (details.description as string) ||
              log.eventType ||
              "N/A";

            return {
              id: log.id.toString(),
              type: log.eventType || "system_log",
              activityType: log.eventType || "System Activity",
              userId: log.userId?.toString() || "unknown",
              username: log.username || "Unknown",
              role: log.role || (details.role as string) || (details.userLevel as string) || null,
              timestamp: new Date(log.timestamp),
              txId: null,
              details: details,
              eventType: log.eventType || "unknown",
              eventDescription: eventDescription,
            };
          })
        );
      }
    } catch (error) {
      console.error("Failed to fetch system logs:", error);
    } finally {
      setActivitiesLoading(false);
    }
  };

  const fetchTuyaUnlockingHistory = async () => {
    setTuyaLoading(true);
    try {
      // Get records from last 7 days
      const endTime = Date.now();
      const startTime = endTime - 7 * 24 * 60 * 60 * 1000; // 7 days ago

      const response = await logsService.getTuyaUnlockingHistory({
        page_no: 1,
        page_size: 100,
        start_time: startTime,
        end_time: endTime,
        showMediaInfo: true,
      });

      if (response.success && response.data) {
        const tuyaLogsData = response.data.map((log, index) => {
          const unlockCode = log.status?.code || "unknown";
          const unlockMethod = getUnlockMethodName(unlockCode);
          
          // Handle status.value which can be string, number, or object per API docs
          const unlockValue = log.status?.value;
          
          return {
            id: `tuya-${log.update_time}-${index}`,
            unlockMethod,
            unlockMethodCode: unlockCode,
            unlockValue: unlockValue,
            nickName: log.nick_name || "",
            unlockName: log.unlock_name || "",
            userId: log.user_id || "0",
            timestamp: new Date(log.update_time),
            avatar: log.avatar,
            mediaInfos: log.media_infos?.map(media => ({
              file_key: media.file_key,
              file_url: media.file_url,
              media_url: media.media_url,
              media_key: media.media_key,
            })),
          };
        });
        
        // Merge Tuya logs into main logs array
        setLogs((prevLogs) => {
          const tuyaMergedLogs = tuyaLogsData.map((tuyaLog) => ({
            id: tuyaLog.id,
            userName: tuyaLog.nickName || tuyaLog.unlockName || `User ${tuyaLog.userId}`,
            userRole: null,
            labName: "Laboratory",
            timestamp: tuyaLog.timestamp,
            blockchainHash: "",
            status: "granted" as const,
            source: "tuya" as const,
            unlockMethod: tuyaLog.unlockMethod,
            unlockValue: tuyaLog.unlockValue,
            avatar: tuyaLog.avatar,
            mediaInfos: tuyaLog.mediaInfos,
          }));
          
          const mergedLogs = [...prevLogs, ...tuyaMergedLogs];
          
          // Sort by timestamp (newest first)
          return mergedLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        });
      }
    } catch (error) {
      console.error("Failed to fetch Tuya unlocking history:", error);
    } finally {
      setTuyaLoading(false);
    }
  };

  // Helper function to map Tuya unlock codes to readable names
  const getUnlockMethodName = (code: string): string => {
    const methodMap: Record<string, string> = {
      unlock_finger: "Fingerprint",
      unlock_pwd: "Password",
      unlock_card: "Card",
      unlock_key: "Key",
      unlock_face: "Face",
      unlock_voice: "Voice",
      unlock_app: "App",
      unlock_remote: "Remote",
      unlock_temp_pwd: "Temporary Password",
      unlock_dynamic_pwd: "Dynamic Password",
      unlock_ble: "Bluetooth",
      unlock_zigbee: "Zigbee",
    };
    return methodMap[code] || code.replace("unlock_", "").replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const columns = [
    {
      header: "User Name",
      accessor: (log: LogDisplay) => (
        <div>
          <div className="flex items-center gap-2">
            {log.source === "tuya" && log.avatar && (
              <img
                src={log.avatar}
                alt={log.userName}
                className="w-8 h-8 rounded-full object-cover"
                onError={(e) => {
                  // Hide image if it fails to load
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
            <div>
              <span className="font-semibold text-gray-900">
                {log.userName || "Unknown User"}
              </span>
              {log.source === "tuya" && (
                <Badge variant="default" className="text-xs mt-1">
                  Tuya
                </Badge>
              )}
            </div>
          </div>
        </div>
      ),
    },
    {
      header: "Role",
      accessor: (log: LogDisplay) => (
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
      accessor: (log: LogDisplay) => (
        <span className="text-sm text-gray-700">
          {log.subject || "N/A"}
        </span>
      ),
    },
    {
      header: "Laboratory",
      accessor: (log: LogDisplay) => (
        <span className="text-sm text-gray-700">
          {log.laboratory || log.labName || "N/A"}
        </span>
      ),
    },
    {
      header: "Date and Time",
      accessor: (log: LogDisplay) => {
        const dateTime = log.dateTime ? new Date(log.dateTime) : log.timestamp;
        return (
          <div className="text-sm">
            <div className="font-medium text-gray-900">
              {dateTime.toLocaleDateString()}
            </div>
            <div className="text-gray-500">
              {dateTime.toLocaleTimeString()}
            </div>
          </div>
        );
      },
    },
    {
      header: "Access Method",
      accessor: (log: LogDisplay) => (
        <div>
          {log.source === "tuya" ? (
            <>
              <Badge variant="info">{log.unlockMethod || "Unknown"}</Badge>
              {log.unlockValue !== undefined && log.unlockValue !== null && (
                <p className="text-xs text-gray-500 mt-1">
                  Value: {typeof log.unlockValue === 'object' 
                    ? JSON.stringify(log.unlockValue) 
                    : String(log.unlockValue)}
                </p>
              )}
            </>
          ) : (
            <Badge variant="info">
              {log.accessMethod || "Unknown"}
            </Badge>
          )}
        </div>
      ),
    },
    {
      header: "Result",
      accessor: (log: LogDisplay) => (
        <Badge variant={log.status === "granted" || log.result === "Granted" ? "success" : "danger"}>
          {log.result || (log.status === "granted" ? "Granted" : "Denied")}
        </Badge>
      ),
    },
    {
      header: "Reason for Denial",
      accessor: (log: LogDisplay) => (
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
      header: "Transaction ID / Media",
      accessor: (log: LogDisplay) => {
        if (log.source === "tuya") {
          return (
            <div>
              {log.mediaInfos && log.mediaInfos.length > 0 ? (
                <div className="space-y-1">
                  {log.mediaInfos.map((media, idx) => {
                    // Prefer media_url over file_url per API docs
                    const mediaUrl = media.media_url || media.file_url;
                    const isImage = media.file_key?.includes("image") || media.media_key?.includes("image");
                    return (
                      <a
                        key={idx}
                        href={mediaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:text-blue-800 underline block"
                      >
                        View {isImage ? "Image" : "Video"} {idx + 1}
                      </a>
                    );
                  })}
                </div>
              ) : (
                <span className="text-gray-400 text-xs">No media</span>
              )}
            </div>
          );
        }
        return (
          <code className="text-xs bg-gray-100 px-2 py-1 rounded">
            {log.blockchainHash
              ? log.blockchainHash.substring(0, 16) + "..."
              : "N/A"}
          </code>
        );
      },
    },
  ];


  // Helper function to categorize event types
  const getEventCategory = (eventType: string): {
    category: string;
    variant: "info" | "success" | "warning" | "danger" | "default";
    icon: string;
  } => {
    const lowerType = eventType.toLowerCase();
    
    // Login/Logout events
    if (lowerType.includes("login") || lowerType === "user_login") {
      return { category: "Login", variant: "info", icon: "🔐" };
    }
    if (lowerType.includes("logout") || lowerType === "user_logout") {
      return { category: "Logout", variant: "info", icon: "🚪" };
    }
    
    // Approval events
    if (
      lowerType.includes("approval") ||
      lowerType.includes("approved") ||
      lowerType.includes("approve")
    ) {
      return { category: "Approval", variant: "success", icon: "✅" };
    }
    if (lowerType.includes("rejected") || lowerType.includes("reject")) {
      return { category: "Approval", variant: "danger", icon: "❌" };
    }
    
    // Update events
    if (
      lowerType.includes("update") ||
      lowerType.includes("updated") ||
      lowerType.includes("edit") ||
      lowerType.includes("modified")
    ) {
      return { category: "Update", variant: "warning", icon: "✏️" };
    }
    
    // Enrollment events
    if (lowerType.includes("enrollment")) {
      return { category: "Enrollment", variant: "info", icon: "📝" };
    }
    
    // User management
    if (lowerType.includes("user_created") || lowerType.includes("user created")) {
      return { category: "User Management", variant: "success", icon: "👤" };
    }
    if (lowerType.includes("user_deleted") || lowerType.includes("user deleted")) {
      return { category: "User Management", variant: "danger", icon: "🗑️" };
    }
    
    // Default
    return { category: "System Activity", variant: "default", icon: "📋" };
  };

  const systemLogColumns = [
    {
      header: "Timestamp",
      accessor: (log: SystemLogDisplay) => log.timestamp.toLocaleString(),
    },
    {
      header: "Event Type",
      accessor: (log: SystemLogDisplay) => {
        const category = getEventCategory(log.eventType);
        return (
          <div className="flex items-center gap-2">
            <span className="text-lg">{category.icon}</span>
            <Badge variant={category.variant}>
              {category.category}
            </Badge>
            <span className="text-xs text-gray-500 ml-1">
              ({log.eventType})
            </span>
          </div>
        );
      },
    },
    {
      header: "User",
      accessor: (log: SystemLogDisplay) => (
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-gray-900">
              {log.username || "System"}
            </p>
            {log.role && (
              <Badge variant="info" className="text-xs">
                {log.role}
              </Badge>
            )}
          </div>
          {log.userId && log.userId !== "unknown" && (
            <p className="text-xs text-gray-500 mt-1">ID: {log.userId}</p>
          )}
        </div>
      ),
    },
    {
      header: "Description",
      accessor: (log: SystemLogDisplay) => (
        <p
          className="text-sm text-gray-700 max-w-md"
          title={log.eventDescription || log.eventType || ""}
        >
          {log.eventDescription || log.eventType || "N/A"}
        </p>
      ),
    },
    {
      header: "Details",
      accessor: (log: SystemLogDisplay) => {
        // Filter out internal fields and show relevant details
        const relevantDetails: Record<string, unknown> = {};
        if (log.details && typeof log.details === "object") {
          Object.entries(log.details).forEach(([key, value]) => {
            // Skip internal metadata fields
            if (
              !["userLevel", "userId", "username", "role", "email", "timestamp", "eventDescription", "fabricTxId"].includes(
                key
              )
            ) {
              relevantDetails[key] = value;
            }
          });
        }
        
        return (
          <div className="text-xs text-gray-600 max-w-xs">
            {Object.keys(relevantDetails).length > 0 ? (
              <div>
                {Object.entries(relevantDetails)
                  .slice(0, 2)
                  .map(([key, value]) => (
                    <p key={key} className="truncate">
                      <span className="font-medium">{key}:</span>{" "}
                      {typeof value === "object"
                        ? JSON.stringify(value).substring(0, 30) + "..."
                        : String(value).substring(0, 30)}
                    </p>
                  ))}
              </div>
            ) : (
              <span className="text-gray-400">No additional details</span>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center space-x-4 p-4 bg-blue-50 rounded-lg mb-6">
          <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
            <DatabaseIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">
              Access & System Logs
            </h3>
            <p className="text-sm text-gray-600">
              View door lock access logs and web system activities (login, logout, approvals, updates)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Total Activities</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {systemLogs.length}
            </p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Access Logs</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">
              {logs.length}
            </p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Last Activity</p>
            <p className="text-sm font-medium text-gray-900 mt-1">
              {systemLogs[0]?.timestamp.toLocaleTimeString() || "N/A"}
            </p>
          </div>
        </div>
      </Card>

      {/* Tab Navigation */}
      <div className="flex space-x-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("access")}
          className={`px-4 py-2 font-medium text-sm ${
            activeTab === "access"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <ShieldCheckIcon className="w-4 h-4 inline mr-2" />
          Access Logs
        </button>
        <button
          onClick={() => setActiveTab("activities")}
          className={`px-4 py-2 font-medium text-sm ${
            activeTab === "activities"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <DatabaseIcon className="w-4 h-4 inline mr-2" />
          System Logs
        </button>
      </div>

      {activeTab === "activities" && (
        <Card title="System Logs">
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">
              <strong>System Logs</strong> track web system activities including:
            </p>
            <ul className="text-sm text-gray-600 mt-2 list-disc list-inside space-y-1">
              <li>Login and logout events</li>
              <li>Approval actions (enrollment approvals/rejections)</li>
              <li>System updates (user updates, role changes, configuration changes)</li>
              <li>Other system activities</li>
            </ul>
          </div>
          {activitiesLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : systemLogs.length > 0 ? (
            <Table data={systemLogs} columns={systemLogColumns} />
          ) : (
            <p className="text-center text-gray-500 py-8">
              No system logs found
            </p>
          )}
        </Card>
      )}

      {activeTab === "access" && (
        <Card title="Access Logs">
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">
              <strong>Access Logs</strong> show which users accessed the door lock, including:
            </p>
            <ul className="text-sm text-gray-600 mt-2 list-disc list-inside space-y-1">
              <li>User name, role, and subject information</li>
              <li>Laboratory name and location</li>
              <li>Date and time of access</li>
              <li>Access method (PIN, RFID, Biometric, etc.)</li>
              <li>Result (Granted/Denied) and reason for denial if applicable</li>
              <li>Blockchain transaction verification or media links</li>
            </ul>
          </div>
          {(loading || tuyaLoading) ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : logs.length > 0 ? (
            <Table data={logs} columns={columns} />
          ) : (
            <p className="text-center text-gray-500 py-8">
              No access logs found
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

