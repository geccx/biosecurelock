import { Card } from "../../components/common/Card";
import { ClipboardListIcon } from "lucide-react";

export function ScheduleChangeRequests() {
  return (
    <div className="space-y-6">
      <Card title="Change Requests">
        <div className="text-center py-12">
          <ClipboardListIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Schedule Change Requests</p>
          <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
            Review and approve or reject schedule change requests. View
            before/after comparison and audit trail. This page will be fully
            wired once the schedule-changes API is available.
          </p>
        </div>
      </Card>
    </div>
  );
}
