/**
 * This is the exact contract expected from the fila-viva-ai service.
 * Keep this interface in sync with that repository's /predict endpoint
 * (see its own README.md, section "Contrato con fila-viva-backend").
 */
export interface PredictionRequest {
  peopleAhead: number;
  activeAgents: number;
  serviceTypeId: string;
  arrivalTime: Date;
}

export interface PredictionResult {
  estimatedWaitMinutes: number;
  confidence: number;
  traditionalEstimateMinutes: number;
  congestionLevel: 'low' | 'medium' | 'high';
}
