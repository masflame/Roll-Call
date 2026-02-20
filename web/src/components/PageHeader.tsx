// @ts-nocheck
import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  showBack?: boolean;
}

function PageHeader({ title, description, action, showBack = true }: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="space-y-3">
      {showBack && (
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-sm font-medium text-text-muted transition hover:text-text-primary"
        >
          &larr; Back
        </button>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-4 lg:hidden">
          <div className="w-1.5 h-8 rounded bg-brand-primary/90" />
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">{title}</h1>
            {description && <p className="text-sm text-text-muted">{description}</p>}
          </div>
        </div>
        {action}
      </div>
    </div>
  );
}

export default PageHeader;
