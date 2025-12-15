import { Hono } from 'hono';
import { authMiddleware, type Bindings } from '../middleware/auth';

const emails = new Hono<{ Bindings: Bindings }>();

emails.use('*', authMiddleware);

// Send monthly report email (stub - requires email service integration)
emails.post('/monthly-report', async (c) => {
  try {
    const params = await c.req.json();
    
    // TODO: Implement email sending logic with Resend/SendGrid/etc.
    console.log('Monthly report request:', params);
    
    return c.json({
      success: false,
      message: 'Email sending not yet implemented - requires email service setup'
    }, 501);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Send test email (stub)
emails.post('/test', async (c) => {
  try {
    const { recipientEmail } = await c.req.json();
    
    console.log('Test email request to:', recipientEmail);
    
    return c.json({
      success: false,
      message: 'Email sending not yet implemented - requires email service setup'
    }, 501);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

export default emails;
