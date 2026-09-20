const { z } = require('zod');

const leadCreate = z.object({
  companyName: z.string().optional(),
  customerId: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  mobile: z.string().optional(),
});

module.exports = { leadCreate };
