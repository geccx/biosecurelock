import { Card } from "../../components/common/Card";
import { CalendarDaysIcon } from "lucide-react";

export function GeneratedSchedules() {
  return (
    <div className="space-y-6">
      <Card title="Generated Schedules">
        <div className="text-center py-12">
          <CalendarDaysIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">
            Generated Weekly Schedules
          </p>
          <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
            View and manage auto-generated schedule instances from semester
            templates. Filter by date, course, instructor, or room. This page
            will be fully wired once the schedule generation API is available.
          </p>
        </div>
      </Card>
    </div>
  );
}
