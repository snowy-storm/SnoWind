// @ts-nocheck
import { Feature } from '../../common/features';

const allFeatures = new Set(Object.values(Feature));

export function getFeaturesForCloudPlan(_plan?: string): Set<string> {
  return allFeatures;
}
