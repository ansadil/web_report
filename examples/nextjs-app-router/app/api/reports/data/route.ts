import { NextResponse } from 'next/server';

const ROWS = [
  { region: 'North', amount: 100 },
  { region: 'North', amount: 250 },
  { region: 'South', amount: 75 },
  { region: 'South', amount: 125 },
  { region: 'West', amount: 300 },
];

export async function POST() {
  return NextResponse.json({ data: ROWS });
}
