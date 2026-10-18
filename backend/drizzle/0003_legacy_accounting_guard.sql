-- No reconstruir contabilidad histórica por suposición. Ver DB-003.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM purchases
    WHERE sale_reference IS NULL OR btrim(sale_reference) = '' OR stamps_earned <> 1
  ) OR EXISTS (
    SELECT 1 FROM loyalty_ledger_entries
    WHERE kind IS NULL OR actor_id IS NULL OR request_id IS NULL OR created_at IS NULL
  ) OR EXISTS (
    SELECT 1 FROM rewards r
    WHERE (r.status = 'redeemed' AND (r.redeemed_at IS NULL OR r.redeemed_by IS NULL OR r.redeemed_location_id IS NULL))
       OR (SELECT count(*) FROM reward_purchase_allocations a WHERE a.reward_id = r.id) <> r.stamps_spent
       OR (r.status IN ('available', 'redeemed') AND
           (SELECT count(*) FROM reward_purchase_allocations a WHERE a.reward_id = r.id AND a.released_at IS NULL) <> r.stamps_spent)
  ) THEN
    RAISE EXCEPTION 'Historial contable incompatible: reconciliar referencias, movimientos y asignaciones antes de migrar. No se modificaron los datos.';
  END IF;
END $$;
