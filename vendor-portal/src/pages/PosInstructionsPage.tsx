import { PageCard } from '../components/Ui';

const sections = [
  {
    title: 'Square',
    body: 'In the cart, tap Add discount, choose Amount or Percentage, and enter the amount shown by the portal.',
  },
  {
    title: 'Stripe',
    body: 'Apply a coupon or discount on the invoice/checkout screen, or subtract the amount before taking payment.',
  },
  {
    title: 'Clover',
    body: 'Open the order, tap Discount, then select a preset or custom %/$ discount that matches the portal amount.',
  },
  {
    title: 'Toast',
    body: 'On the check, tap Discount, choose a preset or custom discount, then close the check as normal.',
  },
];

export function PosInstructionsPage() {
  return (
    <div className="stack">
      <PageCard title="POS instructions" subtitle="The system is POS-agnostic and applied manually by the cashier.">
        <div className="vendor-list">
          {sections.map((section) => (
            <article key={section.title} className="list-row">
              <strong>{section.title}</strong>
              <p className="muted">{section.body}</p>
            </article>
          ))}
        </div>
      </PageCard>
    </div>
  );
}
