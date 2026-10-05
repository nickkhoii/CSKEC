'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatPeso } from '@/lib/money';
import { Card, CardBody, CardHeader } from '@/components/ui';

/**
 * Monthly income vs expenses chart.
 *
 * A client component because Recharts measures the DOM. The parent server
 * component passes plain serialisable numbers, so no Decimal reaches the client.
 */
export function IncomeExpenseChart({ data }) {
  if (!data || data.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Monthly income vs expenses"
        description="Posted ledger entries only; voided transactions are excluded."
      />
      <CardBody>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
                width={64}
                tickFormatter={(value) => `₱${Number(value).toLocaleString('en-PH')}`}
              />
              <Tooltip
                formatter={(value, name) => [
                  formatPeso(value),
                  name === 'income' ? 'Income' : 'Expenses',
                ]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="income" name="income" fill="#0f2743" radius={[3, 3, 0, 0]} />
              <Bar dataKey="expenses" name="expenses" fill="#d48f22" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardBody>
    </Card>
  );
}