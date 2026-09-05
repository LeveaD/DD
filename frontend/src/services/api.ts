/**
 * REST API Client Service — Milestone 8
 *
 * Source of truth: backend/src/api/routes.ts
 * Communicates strictly via HTTP to the backend server.
 */

import type {
  ApiResponse,
  DisputeListItemDto,
  DisputeDetailDto,
  AuditLogEntry,
  EvaluationSummaryData,
} from "../types/api";

const API_BASE = "/api";

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  const json: ApiResponse<T> = await response.json();

  if (!json.success) {
    throw new Error(json.error.message || `API Error: ${response.status}`);
  }

  return json.data;
}

export const api = {
  /** Health check endpoint */
  async getHealth(): Promise<{ status: string }> {
    return request<{ status: string }>("/health");
  },

  /** Fetch list of demo disputes */
  async getDisputes(): Promise<DisputeListItemDto[]> {
    return request<DisputeListItemDto[]>("/disputes");
  },

  /** Fetch details for a specific dispute case */
  async getDisputeDetail(id: string): Promise<DisputeDetailDto> {
    return request<DisputeDetailDto>(`/disputes/${id}`);
  },

  /** Trigger deterministic evidence verification + Groq drafting pipeline */
  async processDispute(id: string): Promise<DisputeDetailDto> {
    return request<DisputeDetailDto>(`/disputes/${id}/process`, {
      method: "POST",
    });
  },

  /** Approve dispute (HUMAN_APPROVAL_REQUIRED -> READY_FOR_SUBMISSION) */
  async approveDispute(id: string): Promise<DisputeDetailDto> {
    return request<DisputeDetailDto>(`/disputes/${id}/approve`, {
      method: "POST",
    });
  },

  /** Submit dispute (READY_FOR_SUBMISSION -> SUBMITTED) — Simulated */
  async submitDispute(id: string): Promise<DisputeDetailDto & { is_simulated?: boolean; submission_notice?: string }> {
    return request<DisputeDetailDto & { is_simulated?: boolean; submission_notice?: string }>(
      `/disputes/${id}/submit`,
      { method: "POST" },
    );
  },

  /** Fetch append-only audit trail entries for a dispute */
  async getAuditLog(id: string): Promise<AuditLogEntry[]> {
    return request<AuditLogEntry[]>(`/disputes/${id}/audit`);
  },

  /** Fetch verified evidence summary for a dispute */
  async getEvidence(id: string): Promise<unknown> {
    return request<unknown>(`/disputes/${id}/evidence`);
  },

  /** Download Evidence Package PDF as a Blob */
  async getEvidencePackagePdf(id: string): Promise<Blob> {
    const response = await fetch(`${API_BASE}/disputes/${id}/evidence-package`);
    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson?.error?.message || "Evidence package PDF is not available");
    }
    return response.blob();
  },

  /** Fetch Evaluation summary metrics from docs/eval_results.json */
  async getEvaluationSummary(): Promise<EvaluationSummaryData> {
    return request<EvaluationSummaryData>("/evaluation/summary");
  },
};
