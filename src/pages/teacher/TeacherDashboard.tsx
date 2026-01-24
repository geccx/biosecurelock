import { useEffect, useState } from "react";
import {
  CalendarIcon,
  ClockIcon,
  CheckCircleIcon,
  FileTextIcon,
} from "lucide-react";
import { Card } from "../../components/common/Card";
import { Badge } from "../../components/common/Badge";
import { ScheduleCalendar } from "../../components/common/ScheduleCalendar";
import { labSchedulesService, type LabSchedule } from "../../services";

interface TeacherDashboardProps {
  teacherId: string;
}

export function TeacherDashboard({ teacherId }: TeacherDashboardProps) {
  const [schedules, setSchedules] = useState<LabSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSchedules();
  }, [teacherId]);

  const fetchSchedules = async () => {
    try {
      const response = await labSchedulesService.getMySchedules();
      if (response.success && response.data) {
        setSchedules(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
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

  const upcomingSchedules = schedules
    .filter(
      (s) =>
        new Date(s.startTime) > new Date() &&
        (s.status === "scheduled" || s.status === "pending")
    )
    .slice(0, 3);

  const completedSchedules = schedules.filter((s) => s.status === "completed");
  const pendingSchedules = schedules.filter((s) => s.status === "pending");
  const totalSchedules = schedules.length;

  const stats = [
    {
      label: "Total Schedules",
      value: totalSchedules,
      icon: CalendarIcon,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      label: "Pending Approval",
      value: pendingSchedules.length,
      icon: ClockIcon,
      color: "text-orange-600",
      bgColor: "bg-orange-100",
    },
    {
      label: "Completed Sessions",
      value: completedSchedules.length,
      icon: CheckCircleIcon,
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
    {
      label: "Upcoming",
      value: upcomingSchedules.length,
      icon: FileTextIcon,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">{stat.label}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {stat.value}
                  </p>
                </div>
                <div
                  className={`w-12 h-12 ${stat.bgColor} rounded-lg flex items-center justify-center`}
                >
                  <Icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Upcoming Schedules">
          <div className="space-y-3">
            {upcomingSchedules.length === 0 ? (
              <p className="text-gray-500 text-center py-4">
                No upcoming schedules
              </p>
            ) : (
              upcomingSchedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="p-4 bg-green-50 rounded-lg border border-green-200"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {schedule.labName}
                      </p>
                      <p className="text-sm text-gray-600">
                        {schedule.subject || "No subject"}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(schedule.startTime).toLocaleString()} -{" "}
                        {new Date(schedule.endTime).toLocaleTimeString()}
                      </p>
                    </div>
                    <Badge
                      variant={
                        schedule.status === "pending"
                          ? "warning"
                          : schedule.status === "scheduled"
                          ? "success"
                          : "info"
                      }
                    >
                      {schedule.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card title="Pending Approval">
          <div className="space-y-3">
            {pendingSchedules.length === 0 ? (
              <p className="text-gray-500 text-center py-4">
                No pending schedules
              </p>
            ) : (
              pendingSchedules.slice(0, 5).map((schedule) => (
                <div
                  key={schedule.id}
                  className="p-4 bg-orange-50 rounded-lg border border-orange-200"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {schedule.labName}
                      </p>
                      <p className="text-sm text-gray-600">
                        {schedule.subject || "No subject"}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(schedule.startTime).toLocaleString()}
                      </p>
                    </div>
                    <Badge variant="warning">Pending</Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <ScheduleCalendar showAllSchedules={false} />
    </div>
  );
}
