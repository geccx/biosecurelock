import { Card } from "../../components/common/Card";
import { FileSpreadsheetIcon } from "lucide-react";

export function ScheduleTemplates() {
  return (
    <div className="space-y-6">
      <Card title="Schedule Templates (Master Timetable)">
        <div className="text-center py-12">
          <FileSpreadsheetIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Schedule Templates</p>
          <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
            Manage master timetable entries per semester. Add templates by day
            and time slot, bulk import from Excel/CSV, and check for conflicts.
            This page will be fully wired once the schedule-templates API is
            available.
          </p>
        </div>
      </Card>
    </div>
  );
}
