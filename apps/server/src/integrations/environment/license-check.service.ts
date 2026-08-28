import { Injectable } from '@nestjs/common';
import { Feature } from '../../common/features';

@Injectable()
export class LicenseCheckService {
  private allFeatures: string[];

  constructor() {
    this.allFeatures = Object.values(Feature);
  }

  isValidEELicense(_licenseKey: string): boolean {
    return true;
  }

  hasFeature(_licenseKey: string, _feature: string, _plan?: string): boolean {
    return true;
  }

  getFeatures(_licenseKey: string): string[] {
    return [...this.allFeatures];
  }

  resolveFeatures(_licenseKey: string, _plan: string): string[] {
    return [...this.allFeatures];
  }

  resolveTier(_licenseKey: string, _plan: string): string {
    return 'enterprise';
  }

  getLicenseType(_licenseKey: string): string {
    return 'enterprise';
  }
}
