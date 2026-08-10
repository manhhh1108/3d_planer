import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Popconfirm, message } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { api } from '@/api/client';

export default function Layouts() {
  const { projectId } = useOutletContext<{ projectId: string }>();
  const navigate = useNavigate();
  const [layouts, setLayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    setLayouts(await api.getLayouts(projectId));
    setLoading(false);
  };

  useEffect(() => { load(); }, [projectId]);

  const handleSave = async (values: any) => {
    const data = { ...values, projectId };
    if (editing) {
      await api.updateLayout(editing.id, data);
      message.success('Da cap nhat mat bang');
    } else {
      await api.createLayout(data);
      message.success('Da tao mat bang');
    }
    setModalOpen(false);
    setEditing(null);
    form.resetFields();
    load();
  };

  const handleDelete = async (id: string) => {
    await api.deleteLayout(id);
    message.success('Da xoa mat bang');
    load();
  };

  const columns = [
    { title: 'Ten mat bang', dataIndex: 'name' },
    { title: 'Rong (m)', dataIndex: 'widthM', width: 100 },
    { title: 'Dai (m)', dataIndex: 'heightM', width: 100 },
    { title: 'Grid (m)', dataIndex: 'gridSize', width: 80 },
    { title: 'Snapshots', dataIndex: ['_count', 'snapshots'], width: 100 },
    {
      title: '', width: 120,
      render: (_: any, record: any) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <EyeOutlined onClick={() => navigate(`/project/${projectId}/layout/${record.id}`)} />
          <EditOutlined onClick={() => { setEditing(record); form.setFieldsValue(record); setModalOpen(true); }} />
          <Popconfirm title="Xoa mat bang?" onConfirm={() => handleDelete(record.id)}>
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
          Tao mat bang
        </Button>
      </div>
      <Table dataSource={layouts} columns={columns} rowKey="id" loading={loading} size="small" />
      <Modal
        title={editing ? 'Sua mat bang' : 'Tao mat bang'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ gridSize: 1.0 }}>
          <Form.Item name="name" label="Ten mat bang" rules={[{ required: true }]}><Input /></Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="widthM" label="Chieu rong (m)" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
            <Form.Item name="heightM" label="Chieu dai (m)" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
          </div>
          <Form.Item name="gridSize" label="Grid size (m)">
            <InputNumber style={{ width: '100%' }} min={0.1} step={0.5} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
