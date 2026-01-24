import { useEffect, useState } from "react";
import { ActivityIcon, RefreshCwIcon } from "lucide-react";
import { Card } from "../../components/common/Card";
import { Badge } from "../../components/common/Badge";
import { Table } from "../../components/common/Table";
import {
  tuyaLogsService,
  type TuyaDeviceLog,
} from "../../services";

interface LogDisplay {
  code: string;
  value: string;
  eventTime: Date;
  eventFrom: string;
  eventId: number;
  eventType: string;
  status: string;
}

const eventTypeMap: Record<number, string> = {
  1: "Online",
  2: "Offline",
  3: "Device Activation",
  4: "Device Reset",
  5: "Instructions Issue",
  6: "Firmware Upgrade",
  7: "Data Point Report",
  8: "Device Semaphore",
  9: "Device Restart",
  10: "Timing Information",
};

const eventFromMap: Record<string, string> = {
  "1": "Device Itself",
  "2": "Client Instructions",
  "3": "Third-party Platforms",
  "4": "Cloud Instructions",
  "-1": "Unknown",
};

export function SystemMonitoring() {
  const [activeTab, setActiveTab] = useState<"device" | "gateway">("device");
  const [deviceLogs, setDeviceLogs] = useState<LogDisplay[]>([]);
  const [gatewayLogs, setGatewayLogs] = useState<LogDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLogs();
  }, [activeTab]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);

      // Calculate time range (last 24 hours)
      const endTime = Date.now();
      const startTime = endTime - 24 * 60 * 60 * 1000; // 24 hours ago

      const params = {
        type: "1,2,3,4,5,6,7,8,9,10", // All event types
        start_time: startTime,
        end_time: endTime,
        size: 50,
        query_type: 1, // Free version
      };

      if (activeTab === "device") {
        const response = await tuyaLogsService.getDeviceLogs(params);
        if (response.success && response.data) {
          setDeviceLogs(transformLogs(response.data.logs || []));
        } else {
          setError(response.error || "Failed to fetch device logs");
        }
      } else {
        const response = await tuyaLogsService.getGatewayLogs(params);
        if (response.success && response.data) {
          setGatewayLogs(transformLogs(response.data.logs || []));
        } else {
          setError(response.error || "Failed to fetch gateway logs");
        }
      }
    } catch (err) {
      console.error("Failed to fetch logs:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch logs"
      );
    } finally {
      setLoading(false);
    }
  };

  const transformLogs = (logs: TuyaDeviceLog[]): LogDisplay[] => {
    return logs.map((log) => ({
      code: log.code || "N/A",
      value:
        typeof log.value === "object"
          ? JSON.stringify(log.value)
          : String(log.value || "N/A"),
      eventTime: new Date(log.event_time),
      eventFrom: eventFromMap[log.event_from] || log.event_from || "Unknown",
      eventId: log.event_id,
      eventType: eventTypeMap[log.event_id] || `Event ${log.event_id}`,
      status: log.status || "1",
    }));
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchLogs();
    setRefreshing(false);
  };

  const currentLogs = activeTab === "device" ? deviceLogs : gatewayLogs;

  const columns = [
    {
      header: "Timestamp",
      accessor: (log: LogDisplay) => log.eventTime.toLocaleString(),
    },
    {
      header: "Event Type",
      accessor: (log: LogDisplay) => (
        <Badge variant="info">{log.eventType}</Badge>
      ),
    },
    {
      header: "Code",
      accessor: (log: LogDisplay) => (
        <span className="font-mono text-sm">{log.code}</span>
      ),
    },
    {
      header: "Value",
      accessor: (log: LogDisplay) => (
        <span className="text-sm text-gray-600 max-w-xs truncate">
          {log.value}
        </span>
      ),
    },
    {
      header: "Event From",
      accessor: (log: LogDisplay) => (
        <Badge variant="secondary">{log.eventFrom}</Badge>
      ),
    },
    {
      header: "Status",
      accessor: (log: LogDisplay) => (
        <Badge variant={log.status === "1" ? "success" : "danger"}>
          {log.status === "1" ? "Active" : "Inactive"}
        </Badge>
      ),
    },
  ];

  if (loading && currentLogs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Device Monitoring</h1>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCwIcon
            className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
          />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <p className="font-medium">Error</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex space-x-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("device")}
          className={`px-4 py-2 font-medium text-sm transition-colors ${
            activeTab === "device"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <ActivityIcon className="w-4 h-4 inline mr-2" />
          Device Logs
        </button>
        <button
          onClick={() => setActiveTab("gateway")}
          className={`px-4 py-2 font-medium text-sm transition-colors ${
            activeTab === "gateway"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <ActivityIcon className="w-4 h-4 inline mr-2" />
          Gateway Logs
        </button>
      </div>

      <Card title={`${activeTab === "device" ? "Device" : "Gateway"} Logs`}>
        {loading && currentLogs.length > 0 ? (
          <div className="flex items-center justify-center py-4">
            <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : currentLogs.length > 0 ? (
          <Table data={currentLogs} columns={columns} />
        ) : (
          <p className="text-center text-gray-500 py-8">
            No logs found for the selected {activeTab === "device" ? "device" : "gateway"}
          </p>
        )}
      </Card>
    </div>
  );
}
