// @ts-nocheck
import { Injectable } from '@nestjs/common';
import { Feature } from '../../common/features';

@Injectable()
export class LicenseService {
  private allFeatures = Object.values(Feature);

  isValidEELicense(_licenseKey: string): boolean {
    return true;
  }

  hasFeature(_licenseKey: string, _feature: string): boolean {
    return true;
  }

  getFeatures(_licenseKey: string): string[] {
    return [...this.allFeatures];
  }

  getLicenseType(_licenseKey: string): string {
    return 'enterprise';
  }
}
