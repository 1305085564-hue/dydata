import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { ContentPageSkeleton } from "./content-page-skeleton";

export default function ContentLoading() {
  return (
    <AdminWorkspaceLayout width="wide">
      <ContentPageSkeleton />
    </AdminWorkspaceLayout>
  );
}
