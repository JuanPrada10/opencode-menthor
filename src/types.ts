export interface LearningCompetency {
  name: string;
  level?: string;
  status?: "pending" | "in_progress" | "mastered" | string;
  description?: string;
}

export interface LearningConcept {
  name: string;
  mastered: boolean;
  notes?: string;
}

export interface LearningHint {
  level: number;
  label: string;
  content: string;
  type?: "concept" | "algorithm" | "snippet";
}

export interface LearningTask {
  title: string;
  description?: string;
  status: "pending" | "active" | "completed" | string;
  context?: string;
  requirements?: string[];
  evaluationCriteria?: string[];
  referenceSnippet?: string;
  referenceLanguage?: string;
  referenceNotes?: string[];
  hints?: LearningHint[];
}

export interface LearningState {
  exists: boolean;
  filePath?: string;
  objective?: string;
  /** Nombre destacado del proyecto (p. ej. de "- **Proyecto**: ..."), opcional. */
  projectName?: string;
  /** Objetivos de aprendizaje desglosados como lista, opcional. */
  learningGoals?: string[];
  status?: string;
  techStack?: string[];
  currentCompetency?: string;
  competencies: LearningCompetency[];
  concepts: LearningConcept[];
  activeTask?: LearningTask | null;
  rawContent?: string;
  lastUpdated?: string;
}
