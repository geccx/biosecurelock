import { useState, useEffect, useMemo } from "react";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import { format, parseISO } from "date-fns";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { labSchedulesService, type LabSchedule } from "../../services";
import { useAuth } from "../../hooks/useAuth";
import { Card } from "./Card";

const localizer = momentLocalizer(moment);

type View = "month" | "week" | "day" | "agenda";

interface ScheduleEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: {
    labName: string;
    teacherName: string;
    subject?: string;
  };
}

interface ScheduleCalendarProps {
  showAllSchedules?: boolean; // If true, shows all schedules (for admin/techsupport), otherwise shows only current user's
}

export function ScheduleCalendar({
  showAllSchedules = false,
}: ScheduleCalendarProps) {
  const { currentUser } = useAuth();
  const [schedules, setSchedules] = useState<LabSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<View>("month");

  useEffect(() => {
    fetchSchedules();
  }, [showAllSchedules, currentUser]);

  const fetchSchedules = async () => {
    setLoading(true);
    try {
      let response;
      if (showAllSchedules) {
        // Admin and techsupport see all approved schedules
        response = await labSchedulesService.getAll({ status: "scheduled" });
      } else {
        // Teachers see only their own approved schedules
        response = await labSchedulesService.getMySchedules();
      }

      if (response.success && response.data) {
        // Filter to only show approved (scheduled) schedules
        const approvedSchedules = response.data.filter(
          (s) => s.status === "scheduled"
        );
        setSchedules(approvedSchedules);
      }
    } catch (error) {
      console.error("Failed to fetch schedules:", error);
    } finally {
      setLoading(false);
    }
  };

  // Transform schedules into calendar events
  const events: ScheduleEvent[] = useMemo(() => {
    return schedules.map((schedule) => {
      const startTime = parseISO(schedule.startTime);
      const endTime = parseISO(schedule.endTime);
      const timeStr = `${format(startTime, "h:mm a")} - ${format(endTime, "h:mm a")}`;
      
      // For admin, techsupport, and teachers, show teacher name, subject, and time
      // showAllSchedules is true for admin and techsupport
      const shouldShowTeacherFormat = showAllSchedules || currentUser?.role === "teacher" || currentUser?.role === "techsupport";
      const title = shouldShowTeacherFormat
        ? `${schedule.teacherName}${schedule.subject ? ` - ${schedule.subject}` : ""} (${timeStr})`
        : `${schedule.labName} - ${schedule.teacherName}${
            schedule.subject ? ` (${schedule.subject})` : ""
          }`;
      
      return {
        id: schedule.id,
        title,
        start: startTime,
        end: endTime,
        resource: {
          labName: schedule.labName,
          teacherName: schedule.teacherName,
          subject: schedule.subject,
        },
      };
    });
  }, [schedules, showAllSchedules, currentUser]);

  // Custom event style
  const eventStyleGetter = (event: ScheduleEvent) => {
    return {
      style: {
        backgroundColor: "#3b82f6",
        borderColor: "#2563eb",
        color: "white",
        borderRadius: "4px",
        border: "none",
        padding: "2px 4px",
        fontSize: "12px",
      },
    };
  };

  // Custom tooltip
  const EventComponent = ({ event }: { event: ScheduleEvent }) => {
    const timeStr = `${format(event.start, "h:mm a")} - ${format(event.end, "h:mm a")}`;
    // For admin, techsupport, and teachers, show teacher name, subject, and time
    const shouldShowTeacherFormat = showAllSchedules || currentUser?.role === "teacher" || currentUser?.role === "techsupport";
    
    return (
      <div className="p-1">
        {shouldShowTeacherFormat ? (
          <>
            <div className="font-semibold text-xs">{event.resource.teacherName}</div>
            {event.resource.subject && (
              <div className="text-xs opacity-90">{event.resource.subject}</div>
            )}
            <div className="text-xs opacity-75 mt-1">{timeStr}</div>
          </>
        ) : (
          <>
            <div className="font-semibold text-xs">{event.resource.labName}</div>
            <div className="text-xs opacity-90">{event.resource.teacherName}</div>
            {event.resource.subject && (
              <div className="text-xs opacity-75">{event.resource.subject}</div>
            )}
            <div className="text-xs opacity-75 mt-1">{timeStr}</div>
          </>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <Card title="Schedule Calendar">
        <div className="flex items-center justify-center h-96">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Schedule Calendar">
      <div className="mb-4 text-sm text-gray-600">
        Showing {events.length} approved schedule
        {events.length !== 1 ? "s" : ""}
      </div>
      <div style={{ height: "600px" }}>
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          view={view}
          onView={setView}
          date={currentDate}
          onNavigate={setCurrentDate}
          eventPropGetter={eventStyleGetter}
          components={{
            event: EventComponent,
          }}
          tooltipAccessor={(event) => {
            const timeStr = `${format(event.start, "h:mm a")} - ${format(event.end, "h:mm a")}`;
            // For admin, techsupport, and teachers, show teacher name, subject, and time
            const shouldShowTeacherFormat = showAllSchedules || currentUser?.role === "teacher" || currentUser?.role === "techsupport";
            if (shouldShowTeacherFormat) {
              return `${event.resource.teacherName}${event.resource.subject ? ` - ${event.resource.subject}` : ""} (${timeStr})`;
            }
            return `${event.resource.labName} - ${event.resource.teacherName}`;
          }}
        />
      </div>
    </Card>
  );
}
