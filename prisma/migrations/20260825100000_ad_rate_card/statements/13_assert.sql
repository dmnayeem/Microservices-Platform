DO $$ DECLARE bad int; BEGIN
  SELECT count(*) INTO bad FROM pg_index WHERE NOT indisvalid;
  IF bad > 0 THEN RAISE EXCEPTION 'INVALID_INDEXES_PRESENT: %', bad; END IF;
END $$;
