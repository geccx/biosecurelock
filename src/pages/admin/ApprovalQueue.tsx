import { useEffect, useState } from "react";
import { CheckIcon, XIcon, ClockIcon, KeyRoundIcon } from "lucide-react";
import { Button } from "../../components/common/Button";
import {
  moveRequestsService,
  passwordRequestsService,
  labSchedulesService,
  type MoveRequest,
  type PasswordRequest,
  type LabSchedule,
} from "../../services";
import { useAlert } from "../../contexts/AlertContext";
import "../../styles/ApprovalQueue.css";

export function ApprovalQueue() {
  const { showAlert } = useAlert();
  const [requests, setRequests] = useState<MoveRequest[]>([]);
  const [passwordRequests, setPasswordRequests] = useState<PasswordRequest[]>([]);
  const [pendingSchedules, setPendingSchedules] = useState<LabSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchRequests(),
        fetchPasswordRequests(),
        fetchPendingSchedules(),
      ]);
    } catch (error) {
      console.error("Failed to fetch requests:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRequests = async () => {
    try {
      const response = await moveRequestsService.getAll();
      if (response.success && response.data) {
        setRequests(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch move requests:", error);
    }
  };

  const fetchPasswordRequests = async () => {
    try {
      const response = await passwordRequestsService.getAll();
      if (response.success && response.data) {
        setPasswordRequests(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch password requests:", error);
    }
  };

  const fetchPendingSchedules = async () => {
    try {
      const response = await labSchedulesService.getAll({ status: "pending" });
      if (response.success && response.data) {
        setPendingSchedules(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch pending schedules:", error);
    }
  };

  const handleApprove = async (requestId: string) => {
    try {
      await moveRequestsService.approve(parseInt(requestId));
      fetchRequests();
    } catch (error) {
      console.error("Failed to approve request:", error);
      showAlert("Failed to approve request. Please try again.", "error");
    }
  };

  const handleDeny = async (requestId: string) => {
    const reason = prompt("Enter denial reason (optional):");
    try {
      await moveRequestsService.deny(parseInt(requestId), reason || undefined);
      fetchRequests();
    } catch (error) {
      console.error("Failed to deny request:", error);
      showAlert("Failed to deny request. Please try again.", "error");
    }
  };

  const handleApprovePassword = async (requestId: number) => {
    try {
      await passwordRequestsService.approve(requestId);
      fetchPasswordRequests();
      showAlert(
        "Password request approved and temporary password created successfully!",
        "success"
      );
    } catch (error: any) {
      console.error("Failed to approve password request:", error);
      showAlert(
        error.response?.data?.error ||
          error.message ||
          "Failed to approve password request. Please try again.",
        "error"
      );
    }
  };

  const handleRejectPassword = async (requestId: number) => {
    const reason = prompt("Enter rejection reason (optional):");
    try {
      await passwordRequestsService.reject(requestId, reason || undefined);
      fetchPasswordRequests();
    } catch (error) {
      console.error("Failed to reject password request:", error);
      showAlert("Failed to reject password request. Please try again.", "error");
    }
  };

  const handleApproveSchedule = async (scheduleId: string) => {
    try {
      await labSchedulesService.approve(parseInt(scheduleId));
      fetchPendingSchedules();
    } catch (error) {
      console.error("Failed to approve schedule:", error);
      showAlert("Failed to approve schedule. Please try again.", "error");
    }
  };

  const handleDisapproveSchedule = async (scheduleId: string) => {
    const reason = prompt("Enter denial reason (optional):");
    try {
      await labSchedulesService.disapprove(
        parseInt(scheduleId),
        reason || undefined
      );
      fetchPendingSchedules();
    } catch (error) {
      console.error("Failed to disapprove schedule:", error);
      showAlert("Failed to disapprove schedule. Please try again.", "error");
    }
  };

  if (loading) {
    return (
      <div className="approval-loading-container">
        <div className="approval-spinner"></div>
      </div>
    );
  }

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const reviewedRequests = requests.filter((r) => r.status !== "pending");
  const pendingPasswordRequests = passwordRequests.filter(
    (r) => r.status === "pending"
  );
  const reviewedPasswordRequests = passwordRequests.filter(
    (r) => r.status !== "pending"
  );

  return (
    <div className="approval-queue-container">
      {/* Password Requests Section */}
      <div className="dashboard-card">
        <div className="card-header">
          <h3 className="card-title">Pending Password Requests</h3>
          <span className="badge badge-warning">{pendingPasswordRequests.length}</span>
        </div>
        {pendingPasswordRequests.length === 0 ? (
          <div className="approval-empty-state">
            <KeyRoundIcon className="approval-empty-icon" />
            <p className="approval-empty-text">No pending password requests</p>
          </div>
        ) : (
          <div className="request-list">
            {pendingPasswordRequests.map((request) => (
              <div key={request.id} className="request-card">
                <div className="request-header">
                  <div className="request-info">
                    <h3 className="request-title">{request.userName}</h3>
                    <p className="request-subtitle">
                      {request.labName} - {request.passwordName}
                    </p>
                    <p className="request-meta">{request.userEmail}</p>
                  </div>
                  <span className="badge badge-warning">Pending</span>
                </div>

                <div className="request-details">
                  <div className="request-detail-item">
                    <p className="request-detail-label">Schedule</p>
                    <p className="request-detail-value">
                      {new Date(request.scheduleStartTime).toLocaleString()} -{" "}
                      {new Date(request.scheduleEndTime).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="request-detail-item">
                    <p className="request-detail-label">Password Validity</p>
                    <p className="request-detail-value">
                      {new Date(request.validFrom).toLocaleString()} -{" "}
                      {new Date(request.validUntil).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="request-details">
                  <div className="request-detail-item">
                    <p className="request-detail-label">Password</p>
                    <p className="request-detail-value-mono">{request.password}</p>
                  </div>
                  <div className="request-detail-item">
                    <p className="request-detail-label">Max Usage</p>
                    <p className="request-detail-value">
                      {request.maxUsage === 1 ? "Once" : "Multiple"}
                    </p>
                  </div>
                </div>

                {request.phone && (
                  <div className="request-detail-full">
                    <p className="request-detail-label">Phone</p>
                    <p className="request-detail-value">{request.phone}</p>
                  </div>
                )}

                <div className="request-actions">
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => handleApprovePassword(request.id)}
                  >
                    <CheckIcon className="icon-sm" />
                    Approve
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleRejectPassword(request.id)}
                  >
                    <XIcon className="icon-sm" />
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {reviewedPasswordRequests.length > 0 && (
        <div className="dashboard-card">
          <div className="card-header">
            <h3 className="card-title">Recently Reviewed Password Requests</h3>
          </div>
          <div className="reviewed-list">
            {reviewedPasswordRequests.map((request) => (
              <div key={request.id} className="reviewed-item">
                <div className="reviewed-item-info">
                  <p className="reviewed-item-name">
                    {request.userName} - {request.passwordName}
                  </p>
                  <p className="reviewed-item-lab">{request.labName}</p>
                  {request.approvedAt && (
                    <p className="reviewed-item-meta">
                      Reviewed on {new Date(request.approvedAt).toLocaleString()}
                      {request.approvedByName && ` by ${request.approvedByName}`}
                    </p>
                  )}
                </div>
                <span
                  className={`badge ${
                    request.status === "approved"
                      ? "badge-success"
                      : request.status === "rejected"
                      ? "badge-danger"
                      : "badge-info"
                  }`}
                >
                  {request.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Schedule Approvals Section */}
      <div className="dashboard-card">
        <div className="card-header">
          <h3 className="card-title">Pending Schedule Approvals</h3>
          <span className="badge badge-warning">{pendingSchedules.length}</span>
        </div>
        {pendingSchedules.length === 0 ? (
          <div className="approval-empty-state">
            <ClockIcon className="approval-empty-icon" />
            <p className="approval-empty-text">No pending schedule approvals</p>
          </div>
        ) : (
          <div className="request-list">
            {pendingSchedules.map((schedule) => (
              <div key={schedule.id} className="request-card">
                <div className="request-header">
                  <div className="request-info">
                    <h3 className="request-title">{schedule.teacherName}</h3>
                    <p className="request-subtitle">{schedule.labName}</p>
                  </div>
                  <span className="badge badge-warning">Pending</span>
                </div>

                <div className="request-details">
                  <div className="request-detail-item">
                    <p className="request-detail-label">Start Time</p>
                    <p className="request-detail-value">
                      {new Date(schedule.startTime).toLocaleString()}
                    </p>
                  </div>
                  <div className="request-detail-item">
                    <p className="request-detail-label">End Time</p>
                    <p className="request-detail-value">
                      {new Date(schedule.endTime).toLocaleString()}
                    </p>
                  </div>
                </div>

                {schedule.subject && (
                  <div className="request-detail-full">
                    <p className="request-detail-label">Subject</p>
                    <p className="request-detail-value">{schedule.subject}</p>
                  </div>
                )}

                <div className="request-actions">
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => handleApproveSchedule(schedule.id)}
                  >
                    <CheckIcon className="icon-sm" />
                    Approve
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDisapproveSchedule(schedule.id)}
                  >
                    <XIcon className="icon-sm" />
                    Disapprove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Move Requests Section */}
      <div className="dashboard-card">
        <div className="card-header">
          <h3 className="card-title">Pending Move Requests</h3>
          <span className="badge badge-warning">{pendingRequests.length}</span>
        </div>
        {pendingRequests.length === 0 ? (
          <div className="approval-empty-state">
            <ClockIcon className="approval-empty-icon" />
            <p className="approval-empty-text">No pending approval requests</p>
          </div>
        ) : (
          <div className="request-list">
            {pendingRequests.map((request) => (
              <div key={request.id} className="request-card">
                <div className="request-header">
                  <div className="request-info">
                    <h3 className="request-title">{request.teacherName}</h3>
                    <p className="request-subtitle">{request.labName}</p>
                  </div>
                  <span className="badge badge-warning">Pending</span>
                </div>

                <div className="request-details">
                  <div className="request-detail-item">
                    <p className="request-detail-label">Current Schedule</p>
                    <p className="request-detail-value">
                      {new Date(request.currentStartTime).toLocaleString()} -{" "}
                      {new Date(request.currentEndTime).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="request-detail-item">
                    <p className="request-detail-label">Requested Schedule</p>
                    <p className="request-detail-value">
                      {new Date(request.requestedStartTime).toLocaleString()} -{" "}
                      {new Date(request.requestedEndTime).toLocaleTimeString()}
                    </p>
                  </div>
                </div>

                <div className="request-detail-full">
                  <p className="request-detail-label">Reason</p>
                  <p className="request-detail-value">{request.reason}</p>
                </div>

                <div className="request-actions">
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => handleApprove(request.id)}
                  >
                    <CheckIcon className="icon-sm" />
                    Approve
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDeny(request.id)}
                  >
                    <XIcon className="icon-sm" />
                    Deny
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {reviewedRequests.length > 0 && (
        <div className="dashboard-card">
          <div className="card-header">
            <h3 className="card-title">Recently Reviewed Move Requests</h3>
          </div>
          <div className="reviewed-list">
            {reviewedRequests.map((request) => (
              <div key={request.id} className="reviewed-item">
                <div className="reviewed-item-info">
                  <p className="reviewed-item-name">{request.teacherName}</p>
                  <p className="reviewed-item-lab">{request.labName}</p>
                  {request.reviewedAt && (
                    <p className="reviewed-item-meta">
                      Reviewed on {new Date(request.reviewedAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <span
                  className={`badge ${
                    request.status === "approved" ? "badge-success" : "badge-danger"
                  }`}
                >
                  {request.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}