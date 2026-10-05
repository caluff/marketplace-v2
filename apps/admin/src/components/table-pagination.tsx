import Link from "next/link";
import {
  TablePagination as SharedTablePagination,
  type TablePaginationProps,
} from "@marketplace-v2/ui/table-pagination";

export function TablePagination(
  props: Omit<TablePaginationProps, "linkComponent">,
) {
  return <SharedTablePagination {...props} linkComponent={Link} />;
}
