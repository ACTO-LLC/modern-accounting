import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Save, TestTube, Loader2, CheckCircle, XCircle, Eye, EyeOff, Info } from 'lucide-react';
import TextField from '@mui/material/TextField';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import { emailSettingsApi, EmailSettings } from '../lib/emailApi';

const emailSettingsSchema = z.object({
  SmtpHost: z.string().min(1, 'SMTP host is required'),
  SmtpPort: z.coerce.number().min(1, 'Port must be at least 1').max(65535, 'Port must be at most 65535'),
  SmtpSecure: z.boolean(),
  SmtpUsername: z.string().min(1, 'Username is required'),
  SmtpPassword: z.string().optional(),
  FromEmail: z.string().email('Invalid email address'),
  FromName: z.string().min(1, 'From name is required'),
  ReplyToEmail: z.string().email('Invalid email address').optional().or(z.literal('')),
  EmailSubjectTemplate: z.string().min(1, 'Subject template is required'),
  EmailBodyTemplate: z.string().min(1, 'Body template is required'),
});

type EmailSettingsFormData = z.infer<typeof emailSettingsSchema>;

const DEFAULT_SUBJECT = 'Invoice {{InvoiceNumber}} from {{CompanyName}}';
const DEFAULT_BODY = `Dear {{CustomerName}},

Please find attached Invoice #{{InvoiceNumber}} dated {{IssueDate}} for {{TotalAmount}}.

Payment is due by {{DueDate}}.

If you have any questions about this invoice, please don't hesitate to contact us.

Thank you for your business!

Best regards,
{{CompanyName}}
{{CompanyEmail}}
{{CompanyPhone}}`;

const TEMPLATE_VARIABLES = [
  { name: '{{CustomerName}}', description: 'Customer name' },
  { name: '{{InvoiceNumber}}', description: 'Invoice number' },
  { name: '{{IssueDate}}', description: 'Invoice date' },
  { name: '{{DueDate}}', description: 'Due date' },
  { name: '{{TotalAmount}}', description: 'Formatted total' },
  { name: '{{CompanyName}}', description: 'Your company name' },
  { name: '{{CompanyEmail}}', description: 'Your company email' },
  { name: '{{CompanyPhone}}', description: 'Your company phone' },
];

export default function EmailSettingsForm() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [hasExistingPassword, setHasExistingPassword] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const { control, handleSubmit, reset } = useForm<EmailSettingsFormData>({
    resolver: zodResolver(emailSettingsSchema),
    defaultValues: {
      SmtpHost: '',
      SmtpPort: 587,
      SmtpSecure: true,
      SmtpUsername: '',
      SmtpPassword: '',
      FromEmail: '',
      FromName: '',
      ReplyToEmail: '',
      EmailSubjectTemplate: DEFAULT_SUBJECT,
      EmailBodyTemplate: DEFAULT_BODY,
    },
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const response = await emailSettingsApi.get();
      if (response.configured && response.settings) {
        const { SmtpHost, SmtpPort, SmtpSecure, SmtpUsername, FromEmail, FromName, ReplyToEmail, EmailSubjectTemplate, EmailBodyTemplate } = response.settings;
        reset({
          SmtpHost: SmtpHost || '',
          SmtpPort: SmtpPort || 587,
          SmtpSecure: SmtpSecure ?? true,
          SmtpUsername: SmtpUsername || '',
          SmtpPassword: '',
          FromEmail: FromEmail || '',
          FromName: FromName || '',
          ReplyToEmail: ReplyToEmail || '',
          EmailSubjectTemplate: EmailSubjectTemplate || DEFAULT_SUBJECT,
          EmailBodyTemplate: EmailBodyTemplate || DEFAULT_BODY,
        });
        setHasExistingPassword(!!SmtpHost);
      }
    } catch (error) {
      console.error('Failed to load email settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = async (data: EmailSettingsFormData) => {
    try {
      setIsSaving(true);
      setMessage(null);

      const payload: EmailSettings & { SmtpPassword?: string } = {
        SmtpHost: data.SmtpHost,
        SmtpPort: data.SmtpPort,
        SmtpSecure: data.SmtpSecure,
        SmtpUsername: data.SmtpUsername,
        FromEmail: data.FromEmail,
        FromName: data.FromName,
        ReplyToEmail: data.ReplyToEmail || undefined,
        EmailSubjectTemplate: data.EmailSubjectTemplate,
        EmailBodyTemplate: data.EmailBodyTemplate,
      };

      // Only include password if provided (allow keeping existing)
      if (data.SmtpPassword) {
        payload.SmtpPassword = data.SmtpPassword;
      }

      await emailSettingsApi.save(payload);
      setMessage({ type: 'success', text: 'Email settings saved successfully!' });
      setHasExistingPassword(true);
    } catch (error) {
      console.error('Failed to save email settings:', error);
      setMessage({ type: 'error', text: 'Failed to save email settings. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setIsTesting(true);
      setTestResult(null);
      const result = await emailSettingsApi.test();
      setTestResult({
        success: result.success,
        message: result.success ? 'Connection successful!' : (result.error || 'Connection failed'),
      });
    } catch (error: any) {
      setTestResult({
        success: false,
        message: error.response?.data?.error || 'Connection test failed',
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* SMTP Server Settings */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Controller
            name="SmtpHost"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="SMTP Host"
                required
                placeholder="smtp.example.com"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              />
            )}
          />
        </div>

        <Controller
          name="SmtpPort"
          control={control}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
              label="SMTP Port"
              type="number"
              required
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
              size="small"
              fullWidth
            />
          )}
        />

        <div className="flex items-center">
          <Controller
            name="SmtpSecure"
            control={control}
            render={({ field }) => (
              <FormControlLabel
                control={<Checkbox {...field} checked={field.value ?? false} />}
                label="Use TLS/SSL (recommended)"
              />
            )}
          />
        </div>

        <Controller
          name="SmtpUsername"
          control={control}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              label="Username"
              required
              placeholder="your-email@example.com"
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
              size="small"
              fullWidth
            />
          )}
        />

        <Controller
          name="SmtpPassword"
          control={control}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              value={field.value ?? ''}
              label={hasExistingPassword ? 'Password (leave blank to keep current)' : 'Password'}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder={hasExistingPassword ? '........' : 'Enter password'}
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
              size="small"
              fullWidth
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                        size="small"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
          )}
        />
      </div>

      {/* Sender Settings */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <h3 className="text-md font-semibold text-gray-700 dark:text-gray-200 mb-4">Sender Information</h3>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Controller
            name="FromName"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="From Name"
                required
                placeholder="Your Company Name"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              />
            )}
          />

          <Controller
            name="FromEmail"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="From Email"
                type="email"
                required
                placeholder="billing@example.com"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              />
            )}
          />

          <div className="sm:col-span-2">
            <Controller
              name="ReplyToEmail"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  label="Reply-To Email (optional)"
                  type="email"
                  placeholder="support@example.com"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  size="small"
                  fullWidth
                />
              )}
            />
          </div>
        </div>
      </div>

      {/* Email Templates */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-md font-semibold text-gray-700 dark:text-gray-200">Email Template</h3>
          <div className="relative group">
            <button type="button" className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400">
              <Info className="h-5 w-5" />
            </button>
            <div className="absolute right-0 w-64 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <p className="text-xs font-semibold mb-2 text-gray-700 dark:text-gray-200">Available Variables:</p>
              <ul className="text-xs space-y-1">
                {TEMPLATE_VARIABLES.map(v => (
                  <li key={v.name} className="text-gray-600 dark:text-gray-400">
                    <code className="text-indigo-600 dark:text-indigo-400">{v.name}</code> - {v.description}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <Controller
            name="EmailSubjectTemplate"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Subject Template"
                required
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              />
            )}
          />

          <Controller
            name="EmailBodyTemplate"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Body Template"
                required
                multiline
                rows={10}
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
                slotProps={{
                  input: {
                    sx: { fontFamily: 'monospace' },
                  },
                }}
              />
            )}
          />
        </div>
      </div>

      {/* Test Connection Result */}
      {testResult && (
        <div className={`rounded-md p-4 ${testResult.success ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
          <div className="flex items-center">
            {testResult.success ? (
              <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500 mr-2" />
            )}
            <p className={`text-sm font-medium ${testResult.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
              {testResult.message}
            </p>
          </div>
        </div>
      )}

      {/* Save Message */}
      {message && (
        <div className={`rounded-md p-4 ${message.type === 'success' ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
          <p className={`text-sm font-medium ${message.type === 'success' ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
            {message.text}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outlined"
          onClick={handleTestConnection}
          disabled={isTesting}
          startIcon={isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
        >
          {isTesting ? 'Testing...' : 'Test Connection'}
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={isSaving}
          startIcon={isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        >
          {isSaving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </form>
  );
}
