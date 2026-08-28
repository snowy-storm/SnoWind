jest.mock('mermaid', () => ({
  __esModule: true,
  default: {
    initialize: jest.fn(),
    render: jest.fn(async () => ({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40">
        <rect x="0" y="0" width="120" height="40" fill="#EEEEEE" stroke="#999999"/>
        <text x="16" y="26" fill="#000000">Hello</text>
      </svg>`,
    })),
  },
}));

import { mermaidToPng } from './mermaid-to-png';

describe('mermaidToPng', () => {
  it('renders mermaid SVG output to PNG', async () => {
    const png = await mermaidToPng('flowchart LR\n  A[Hello] --> B[World]');
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(png.length).toBeGreaterThan(50);
  });
});
