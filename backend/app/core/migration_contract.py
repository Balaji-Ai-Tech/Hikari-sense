from __future__ import annotations

from collections.abc import Mapping

from sqlalchemy import inspect
from sqlalchemy.engine import Connection
from sqlalchemy.types import TypeEngine


def _type_signature(type_: TypeEngine, bind: Connection) -> str:
    signature = type_.compile(dialect=bind.dialect)
    return "DOUBLE PRECISION" if signature in {"FLOAT", "FLOAT(53)"} else signature


def validate_table_contract(
    bind: Connection,
    table_name: str,
    *,
    columns: Mapping[str, tuple[TypeEngine, bool]],
    primary_key: tuple[str, ...],
    unique_constraints: set[tuple[str, ...]],
    foreign_keys: set[tuple[tuple[str, ...], str, tuple[str, ...], str | None]],
    indexes: Mapping[str, tuple[tuple[str, ...], bool]] | None = None,
) -> None:
    inspector = inspect(bind)
    if table_name not in inspector.get_table_names():
        raise RuntimeError(f"Expected table {table_name!r} is missing")

    actual_columns = {column["name"]: column for column in inspector.get_columns(table_name)}
    if set(actual_columns) != set(columns):
        raise RuntimeError(f"Unexpected columns for {table_name!r}: {sorted(actual_columns)}")
    for name, (expected_type, expected_nullable) in columns.items():
        actual = actual_columns[name]
        actual_type = _type_signature(actual["type"], bind)
        expected = _type_signature(expected_type, bind)
        if actual_type != expected or actual["nullable"] != expected_nullable:
            raise RuntimeError(f"Column {table_name}.{name} does not match its expected type/nullability")

    actual_primary_key = tuple(inspector.get_pk_constraint(table_name).get("constrained_columns") or ())
    if actual_primary_key != primary_key:
        raise RuntimeError(f"Primary key for {table_name!r} does not match the expected columns")

    actual_unique_constraints = {
        tuple(item.get("column_names") or ()) for item in inspector.get_unique_constraints(table_name)
    }
    if actual_unique_constraints != unique_constraints:
        raise RuntimeError(f"Unique constraints for {table_name!r} do not match the expected columns")

    actual_foreign_keys = set()
    for item in inspector.get_foreign_keys(table_name):
        ondelete = (item.get("options") or {}).get("ondelete")
        actual_foreign_keys.add(
            (
                tuple(item.get("constrained_columns") or ()),
                item["referred_table"],
                tuple(item.get("referred_columns") or ()),
                str(ondelete).upper() if ondelete else None,
            )
        )
    if actual_foreign_keys != foreign_keys:
        raise RuntimeError(f"Foreign keys for {table_name!r} do not match the expected contract")

    expected_indexes = indexes or {}
    actual_indexes = {
        item["name"]: item
        for item in inspector.get_indexes(table_name)
        if not item.get("duplicates_constraint")
    }
    for name, (expected_columns, expected_unique) in expected_indexes.items():
        actual = actual_indexes.get(name)
        if (
            actual is None
            or tuple(actual.get("column_names") or ()) != expected_columns
            or bool(actual.get("unique")) != expected_unique
        ):
            raise RuntimeError(f"Index {table_name}.{name} does not match its expected definition")
    if indexes is not None:
        unexpected_indexes = set(actual_indexes) - set(expected_indexes)
        if unexpected_indexes:
            raise RuntimeError(f"Unexpected indexes for {table_name!r}: {sorted(unexpected_indexes)}")