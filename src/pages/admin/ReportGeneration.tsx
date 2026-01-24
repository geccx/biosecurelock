import { useState } from "react";
import { Card } from "../../components/common/Card";
import { Badge } from "../../components/common/Badge";
import { logsService } from "../../services";
import { DownloadIcon, FileTextIcon, FileSpreadsheetIcon, LoaderIcon } from "lucide-react";

export function ReportGeneration() {
  const [format, setFormat] = useState<"pdf" | "csv">("pdf");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Filter states
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [userId, setUserId] = useState("");
  const [accessMethod, setAccessMethod] = useState("");
  const [successFilter, setSuccessFilter] = useState<boolean | undefined>(undefined);

  const handleGenerateReport = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(false);

      const filters: {
        startDate?: string;
        endDate?: string;
        userId?: number;
        accessMethod?: string;
        success?: boolean;
      } = {};

      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      if (userId) filters.userId = parseInt(userId);
      if (accessMethod) filters.accessMethod = accessMethod;
      if (successFilter !== undefined) filters.success = successFilter;

      const blob = await logsService.generateAdminReport(format, filters);

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `admin_report_${Date.now()}.${format === "pdf" ? "pdf" : "csv"}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to generate report:", err);
      setError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card title="Generate Admin Report">
        <p className="text-sm text-gray-600 mb-6">
          Generate comprehensive reports including all access logs, system logs, and statistics.
          Reports can be exported as PDF or CSV format.
        </p>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-800">Report generated successfully!</p>
          </div>
        )}

        <div className="space-y-6">
          {/* Format Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Report Format
            </label>
            <div className="flex gap-4">
              <button
                onClick={() => setFormat("pdf")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                  format === "pdf"
                    ? "bg-blue-50 border-blue-500 text-blue-700"
                    : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <FileTextIcon className="w-5 h-5" />
                PDF
              </button>
              <button
                onClick={() => setFormat("csv")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                  format === "csv"
                    ? "bg-blue-50 border-blue-500 text-blue-700"
                    : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <FileSpreadsheetIcon className="w-5 h-5" />
                CSV
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                User ID (Optional)
              </label>
              <input
                type="number"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="Filter by user ID"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Access Method
              </label>
              <select
                value={accessMethod}
                onChange={(e) => setAccessMethod(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Methods</option>
                <option value="fingerprint">Fingerprint</option>
                <option value="rfid">RFID</option>
                <option value="pin">PIN</option>
                <option value="remote">Remote</option>
                <option value="auto_schedule">Auto Schedule</option>
                <option value="key">Key</option>
                <option value="temporary_password">Temporary Password</option>
                <option value="dynamic_password">Dynamic Password</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Success Status
              </label>
              <select
                value={successFilter === undefined ? "" : successFilter ? "true" : "false"}
                onChange={(e) => {
                  const value = e.target.value;
                  setSuccessFilter(value === "" ? undefined : value === "true");
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All</option>
                <option value="true">Successful</option>
                <option value="false">Failed</option>
              </select>
            </div>
          </div>

          {/* Generate Button */}
          <div className="pt-4">
            <button
              onClick={handleGenerateReport}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <LoaderIcon className="w-5 h-5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <DownloadIcon className="w-5 h-5" />
                  Generate Report
                </>
              )}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

