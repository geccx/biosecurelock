import { Card } from "../../components/common/Card";
import { HistoryIcon } from "lucide-react";

export function ScheduleAuditTrail() {
  return (
    <div className="space-y-6">
      <Card title="Audit Trail">
        <div className="text-center py-12">
          <HistoryIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Schedule Audit Trail</p>
          <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
            View full history of schedule modifications: what changed, who
            requested, who approved, and when. This page will be fully wired
            once the schedule-changes and audit API is available.
          </p>
        </div>
      </Card>
    </div>
  );
}
