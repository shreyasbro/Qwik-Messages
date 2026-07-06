from datetime import datetime, UTC
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False)

    # Relationships
    items = relationship("Item", back_populates="owner", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="user", cascade="all, delete-orphan")
    sales_persons = relationship("SalesPerson", back_populates="user", cascade="all, delete-orphan")
    work_orders = relationship("WorkOrder", back_populates="user", cascade="all, delete-orphan")
    v2v_processes = relationship("VoiceToVoiceProcess", back_populates="user", cascade="all, delete-orphan")

class Item(Base):
    __tablename__ = "items"
    id = Column(Integer, primary key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    price = Column(Float, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False)

    owner = relationship("User", back_populates="items")
    invoice_items = relationship("InvoiceItem", back_populates="item", cascade="all, delete-orphan")

class Invoice(Base):
    __tablename__ = "invoices"
    id = Column(Integer, primary key=True, index=True)
    invoice_number = Column(String, unique=True, index=True, nullable=False)
    date = Column(DateTime(timezone=True), nullable=False)
    due_date = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, nullable=False, default="Draft") # Draft, Sent, Paid, Void, etc.
    customer_name = Column(String, nullable=False)
    customer_email = Column(String, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False)

    user = relationship("User", back_populates="invoices")
    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")

class InvoiceItem(Base):
    __tablename__ = "invoice_items"
    id = Column(Integer, primary key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    unit_price = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False)

    invoice = relationship("Invoice", back_populates="items")
    item = relationship("Item", back_populates="invoice_items")

class SalesPerson(Base):
    __tablename__ = "sales_persons"
    id = Column(Integer, primary key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False)

    user = relationship("User", back_populates="sales_persons")
    work_orders = relationship("WorkOrder", back_populates="sales_person", cascade="all, delete-orphan")

class WorkOrder(Base):
    __tablename__ = "work_orders"
    id = Column(Integer, primary key=True, index=True)
    work_order_number = Column(String, unique=True, index=True, nullable=False)
    status = Column(String, nullable=False, default="Draft") # Draft, Scheduled, In Progress, Completed, Cancelled
    description = Column(String, nullable=True)
    scheduled_date = Column(DateTime(timezone=True), nullable=True)
    completion_date = Column(DateTime(timezone=True), nullable=True)
    sales_person_id = Column(Integer, ForeignKey("sales_persons.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False)

    user = relationship("User", back_populates="work_orders")
    sales_person = relationship("SalesPerson", back_populates="work_orders")
    items = relationship("WorkOrderItem", back_populates="work_order", cascade="all, delete-orphan")

class WorkOrderItem(Base):
    __tablename__ = "work_order_items"
    id = Column(Integer, primary key=True, index=True)
    work_order_id = Column(Integer, ForeignKey("work_orders.id"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False)

    work_order = relationship("WorkOrder", back_populates="items")
    item = relationship("Item")

class VoiceToVoiceProcess(Base):
    __tablename__ = "voice_to_voice_processes"
    id = Column(Integer, primary key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String, nullable=False, default="processing") # processing, completed, failed
    voice_url = Column(String, nullable=False)
    transcription = Column(String, nullable=True)
    structured_data = Column(String, nullable=True) # JSON representation of extracted data
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False)

    user = relationship("User", back_populates="v2v_processes")
