-- Partners could not delete their own cancelled/expired invoices: invoices had
-- select/insert/update policies but no delete policy, so the delete silently
-- affected zero rows and a following customer delete failed on
-- invoices_customer_id_fkey. invoice_line_items cascade from invoices.

create policy invoices_delete on invoices for delete
  using (public.is_admin() or distributor_id = public.my_distributor_id());
