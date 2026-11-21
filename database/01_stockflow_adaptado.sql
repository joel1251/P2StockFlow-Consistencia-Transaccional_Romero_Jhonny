-- StockFlow Inventory: adaptación académica del modelo de Hussein Almoadhen (MIT).
-- Se conservan las entidades asignadas y se adapta orders para movimientos entre bodegas.
CREATE TABLE products (
 product_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 product_name varchar(150) NOT NULL CHECK(length(trim(product_name))>0),
 sku varchar(50) UNIQUE NOT NULL, is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE warehouses (
 warehouse_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 warehouse_name varchar(150) NOT NULL, city varchar(100) NOT NULL
);
CREATE TABLE inventory (
 inventory_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 product_id integer NOT NULL REFERENCES products,
 warehouse_id integer NOT NULL REFERENCES warehouses,
 quantity_in_stock integer NOT NULL CHECK(quantity_in_stock>=0),
 last_updated timestamptz NOT NULL DEFAULT now(),
 UNIQUE(product_id,warehouse_id)
);
CREATE TABLE orders (
 order_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 product_id integer NOT NULL REFERENCES products,
 source_id integer NOT NULL REFERENCES warehouses,
 destination_id integer NOT NULL REFERENCES warehouses,
 quantity integer NOT NULL CHECK(quantity>0),
 actor varchar(100) NOT NULL, order_date timestamptz NOT NULL DEFAULT now(),
 order_status varchar(20) NOT NULL DEFAULT 'CONFIRMADO' CHECK(order_status='CONFIRMADO'),
 CHECK(source_id<>destination_id)
);
INSERT INTO products(product_name,sku) VALUES ('Laptop','SF-001'),('Monitor','SF-002'),('Teclado','SF-003');
INSERT INTO warehouses(warehouse_name,city) VALUES ('Bodega Central','Santo Domingo'),('Bodega Norte','Quito'),('Bodega Sur','Guayaquil');
INSERT INTO inventory(product_id,warehouse_id,quantity_in_stock) VALUES
(1,1,10),(1,2,2),(1,3,0),(2,1,1),(2,2,0),(2,3,0),(3,1,8),(3,2,3),(3,3,1);
CREATE FUNCTION move_stock(p integer,src integer,dst integer,qty integer,who text,fail boolean)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE available integer; oid integer;
BEGIN
 IF qty<=0 OR src=dst THEN RAISE EXCEPTION 'Cantidad o destino inválido'; END IF;
 PERFORM 1 FROM products WHERE product_id=p AND is_active FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Producto inexistente o inactivo'; END IF;
 -- Bloquear ambas filas en orden fijo para evitar espera circular.
 PERFORM 1 FROM inventory WHERE product_id=p AND warehouse_id IN(src,dst) ORDER BY warehouse_id FOR UPDATE;
 SELECT quantity_in_stock INTO available FROM inventory WHERE product_id=p AND warehouse_id=src;
 IF available IS NULL OR available<qty THEN RAISE EXCEPTION 'Stock insuficiente'; END IF;
 IF NOT EXISTS(SELECT 1 FROM inventory WHERE product_id=p AND warehouse_id=dst) THEN RAISE EXCEPTION 'Destino inexistente'; END IF;
 INSERT INTO orders(product_id,source_id,destination_id,quantity,actor) VALUES(p,src,dst,qty,who) RETURNING order_id INTO oid;
 UPDATE inventory SET quantity_in_stock=quantity_in_stock-qty,last_updated=now() WHERE product_id=p AND warehouse_id=src;
 UPDATE inventory SET quantity_in_stock=quantity_in_stock+qty,last_updated=now() WHERE product_id=p AND warehouse_id=dst;
 IF fail THEN RAISE EXCEPTION 'Fallo simulado después de registrar y actualizar inventario'; END IF;
 RETURN jsonb_build_object('orderId',oid,'quantity',qty,'sourceRemaining',available-qty);
END $$;

