import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, ColorPicker, Popconfirm, message, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { useOutletContext } from 'react-router-dom';
import { api } from '@/api/client';
import FileUploader from '@/components/common/FileUploader';

const PROCESS_STAGES = ['Han', 'Son', 'Lap rap', 'Cat', 'Uon', 'Khoan', 'Gia cong CNC', 'Khac'];
const PROCESS_COLORS: Record<string, string> = {
  Han: 'orange', Son: 'green', 'Lap rap': 'blue', Cat: 'magenta',
  Uon: 'purple', Khoan: 'cyan', 'Gia cong CNC': 'geekblue', Khac: 'default',
};

export default function Products() {
  const { projectId } = useOutletContext<{ projectId: string }>();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    setProducts(await api.getProducts(projectId));
    setLoading(false);
  };

  useEffect(() => { load(); }, [projectId]);

  const handleSave = async (values: any) => {
    const data = {
      ...values,
      projectId,
      color: typeof values.color === 'string' ? values.color : values.color?.toHexString?.() ?? '#58a6ff',
    };
    if (editing) {
      await api.updateProduct(editing.id, data);
      message.success('Da cap nhat san pham');
    } else {
      await api.createProduct(data);
      message.success('Da tao san pham');
    }
    setModalOpen(false);
    setEditing(null);
    form.resetFields();
    load();
  };

  const handleDelete = async (id: string) => {
    await api.deleteProduct(id);
    message.success('Da xoa san pham');
    load();
  };

  const columns = [
    { title: 'Ma', dataIndex: 'code', width: 100 },
    {
      title: 'Ten san pham', dataIndex: 'name',
      render: (name: string, record: any) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: record.color }} />
          {name}
        </div>
      ),
    },
    { title: 'Khoi luong (kg)', dataIndex: 'weightKg', width: 130, render: (v: number) => v?.toLocaleString() ?? '-' },
    { title: 'Dien tich (m2)', dataIndex: 'areaM2', width: 130, render: (v: number) => v ?? '-' },
    {
      title: 'Cong doan', dataIndex: 'processStage', width: 120,
      render: (v: string) => v ? <Tag color={PROCESS_COLORS[v] || 'default'}>{v}</Tag> : '-',
    },
    {
      title: 'Loai', dataIndex: 'category', width: 100,
      render: (v: string) => v === 'thiet_bi' ? 'Thiet bi' : 'San pham',
    },
    {
      title: '', width: 80,
      render: (_: any, record: any) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <EditOutlined onClick={() => { setEditing(record); form.setFieldsValue(record); setModalOpen(true); }} />
          <Popconfirm title="Xoa san pham?" onConfirm={() => handleDelete(record.id)}>
            <DeleteOutlined />
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}>
          Them san pham
        </Button>
      </div>
      <Table dataSource={products} columns={columns} rowKey="id" loading={loading} size="small" />
      <Modal
        title={editing ? 'Sua san pham' : 'Them san pham'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        onOk={() => form.submit()}
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ category: 'san_pham', color: '#58a6ff' }}>
          <Form.Item name="name" label="Ten" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="code" label="Ma san pham" rules={[{ required: true }]}><Input /></Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="weightKg" label="Khoi luong (kg)" style={{ flex: 1 }}><InputNumber style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="areaM2" label="Dien tich (m2)" style={{ flex: 1 }}><InputNumber style={{ width: '100%' }} /></Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="processStage" label="Cong doan" style={{ flex: 1 }}>
              <Select options={PROCESS_STAGES.map(s => ({ label: s, value: s }))} allowClear />
            </Form.Item>
            <Form.Item name="category" label="Loai" style={{ flex: 1 }}>
              <Select options={[{ label: 'San pham', value: 'san_pham' }, { label: 'Thiet bi', value: 'thiet_bi' }]} />
            </Form.Item>
          </div>
          <Form.Item name="color" label="Mau sac"><ColorPicker /></Form.Item>
          <Form.Item name="sharepointLink" label="SharePoint link"><Input placeholder="https://..." /></Form.Item>
          <Form.Item label="File 2D (DWG/DXF)">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#8b949e', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {form.getFieldValue('file2dUrl') || 'Chua co file'}
              </span>
              <FileUploader accept=".dwg,.dxf" onUploaded={(url) => form.setFieldsValue({ file2dUrl: url })} />
            </div>
          </Form.Item>
          <Form.Item label="File 3D (STEP/STP/IFC)">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#8b949e', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {form.getFieldValue('file3dUrl') || 'Chua co file'}
              </span>
              <FileUploader accept=".step,.stp,.ifc,.glb,.gltf" onUploaded={(url) => form.setFieldsValue({ file3dUrl: url })} />
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
