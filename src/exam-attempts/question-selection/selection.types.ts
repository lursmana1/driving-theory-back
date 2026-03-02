/**
 * Types and constants for question selection.
 */

export interface SelectionOptions {
  userId: number;
  lang: string;
  count?: number;
  subjects?: number[];
  categories?: number[];
  allSubjects?: boolean;
}

export interface SelectionRatios {
  random: number;
  mistakes: number;
  success: number;
}

export interface WeaknessIds {
  mistakeIds: number[];
  successIds: number[];
  mistakeSubjects: number[];
  successSubjects: number[];
}

/** Full personalization (500+ answers): 50% random, 40% mistakes, 10% success. */
export const FULL_RATIOS: SelectionRatios = {
  random: 0.5,
  mistakes: 0.4,
  success: 0.1,
};

/** Light personalization (100–499 answers): mainly random. */
export const LIGHT_RATIOS: SelectionRatios = {
  random: 0.7,
  mistakes: 0.25,
  success: 0.05,
};
