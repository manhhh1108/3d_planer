import { useEffect, useState } from 'react';
import { Card, Button, Modal, Form, Input, Row, Col, Popconfirm, message, Spin } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';

export default function Dashboard() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    setProjects(await api.getProjects());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (values: { name: string; description?: string }) => {
    if (editing) {
      await api.updateProject(editing.id, values);
      message.success('Da cap nhat du an');
    } else {
      await api.createProject(values);
      message.success('Da tao du an');
    }
    setModalOpen(false);
    setEditing(null);
    form.resetFields();
    load();
  };

  const handleDelete = async (id: string) => {
    await api.deleteProject(id);
    message.success('Da xoa du an');
    load();
  };

  if (loading) return <Spin size="large" />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ color: '#f0f6fc', margin: 0 }}>Du an cua toi</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}>
          Tao du an moi
        </Button>
      </div>

      <Row gutter={[16, 16]}>
        {projects.map((p) => (
          <Col xs={24} sm={12} lg={8} key={p.id}>
            <Card
              hoverable
              onClick={() => navigate(`/project/${p.id}`)}
              actions={[
                <EditOutlined key="edit" onClick={(e) => { e.stopPropagation(); setEditing(p); form.setFieldsValue(p); setModalOpen(true); }} />,
                <Popconfirm title="Xoa du an?" onConfirm={(e) => { e?.stopPropagation(); handleDelete(p.id); }} onCancel={(e) => e?.stopPropagation()}>
                  <DeleteOutlined key="delete" onClick={(e) => e.stopPropagation()} />
                </Popconfirm>,
              ]}
            >
              <Card.Meta
                title={p.name}
                description={p.description || 'Khong co mo ta'}
              />
              <div style={{ marginTop: 12, fontSize: 12, color: '#8b949e' }}>
                {p._count?.layouts ?? 0} mat bang | {p._count?.products ?? 0} san pham
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Modal
        title={editing ? 'Sua du an' : 'Tao du an moi'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="Ten du an" rules={[{ required: true, message: 'Nhap ten du an' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Mo ta">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
