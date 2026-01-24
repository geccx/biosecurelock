import React, { useState, useEffect } from "react";
import { Card } from "../../components/common/Card";
import { Badge } from "../../components/common/Badge";
import { Table } from "../../components/common/Table";
import { moveRequestsService, type MoveRequest } from "../../services";

interface RequestMoveProps {
  teacherId: string;
}

interface MoveRequestDisplay {
  id: string;
  labName: string;
  currentStartTime: Date;
  currentEndTime: Date;
  requestedStartTime: Date;
  requestedEndTime: Date;
  reason: string;
  status: "pending" | "approved" | "denied";
  requestedAt: Date;
}

export function RequestMove({ teacherId }: RequestMoveProps) {
  const [moveRequests, setMoveRequests] = useState<MoveRequestDisplay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMoveRequests();
  }, [teacherId]);

  const fetchMoveRequests = async () => {
    try {
      const response = await moveRequestsService.getMyRequests();
      if (response.success && response.data) {
        setMoveRequests(
          response.data.map((r) => ({
            id: r.id,
            labName: r.labName,
            currentStartTime: new Date(r.currentStartTime),
            currentEndTime: new Date(r.currentEndTime),
            requestedStartTime: new Date(r.requestedStartTime),
            requestedEndTime: new Date(r.requestedEndTime),
            reason: r.reason,
            status: r.status,
            requestedAt: new Date(r.requestedAt),
          }))
        );
      }
    } catch (error) {
      console.error("Failed to fetch move requests:", error);
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

  const columns = [
    {
      header: "Lab Name",
      accessor: "labName" as keyof MoveRequestDisplay,
    },
    {
      header: "Current Schedule",
      accessor: (req: MoveRequestDisplay) => (
        <div className="text-sm">
          <div>{req.currentStartTime.toLocaleString()}</div>
          <div className="text-gray-500">to {req.currentEndTime.toLocaleTimeString()}</div>
        </div>
      ),
    },
    {
      header: "Requested Schedule",
      accessor: (req: MoveRequestDisplay) => (
        <div className="text-sm">
          <div>{req.requestedStartTime.toLocaleString()}</div>
          <div className="text-gray-500">to {req.requestedEndTime.toLocaleTimeString()}</div>
        </div>
      ),
    },
    {
      header: "Reason",
      accessor: (req: MoveRequestDisplay) => (
        <div className="max-w-xs truncate" title={req.reason}>
          {req.reason}
        </div>
      ),
    },
    {
      header: "Status",
      accessor: (req: MoveRequestDisplay) => (
        <Badge
          variant={
            req.status === "pending"
              ? "warning"
              : req.status === "approved"
              ? "success"
              : "danger"
          }
        >
          {req.status}
        </Badge>
      ),
    },
    {
      header: "Requested At",
      accessor: (req: MoveRequestDisplay) => req.requestedAt.toLocaleString(),
    },
  ];

  return (
    <div className="space-y-6">
      <Card title="Schedule Move Requests">
        {moveRequests.length > 0 ? (
          <Table data={moveRequests} columns={columns} />
        ) : (
          <p className="text-center text-gray-500 py-8">
            No move requests found. You haven't submitted any schedule move requests yet.
          </p>
        )}
      </Card>
    </div>
  );
}
