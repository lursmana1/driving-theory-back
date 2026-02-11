export class CreateExamDto {
  // Optional human-readable title for the exam
  title?: string;

  // Array of Question document IDs (Mongo ObjectIds as strings)
  questionIds: string[];
}
