export interface LogEvent {
    timestamp: number;
    eventType: string;
    [key: string]: any; // allows flexible extra data
  }
  
  export interface SessionInfo {
    participantId: string;
    scenario: string;
    condition: string;
  }
  