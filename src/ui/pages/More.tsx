import { Link } from 'react-router-dom';
import { NAV } from '../components/Layout';
import { PageHeader } from '../components/ui';

export default function More() {
  return (
    <>
      <PageHeader title="Plus" />
      <div className="grid grid-cols-2 gap-3">
        {NAV.slice(1).map((n) => (
          <Link key={n.to} to={n.to} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 hover:border-accent">
            <n.icon className="text-accent" />{n.label}
          </Link>
        ))}
      </div>
    </>
  );
}
