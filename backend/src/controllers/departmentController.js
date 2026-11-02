const Department = require('../models/Department');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

// Teams with member counts and their heads (Team Heads = role 'manager').
const listDepartments = catchAsync(async (req, res) => {
  const departments = await Department.find().sort('name').lean();
  const people = await User.find({ department: { $ne: null }, status: { $ne: 'disabled' } })
    .select('name role department')
    .lean();
  res.status(200).json({
    departments: departments.map((d) => {
      const mine = people.filter((p) => String(p.department) === String(d._id));
      return {
        ...d,
        memberCount: mine.length,
        heads: mine.filter((p) => p.role === 'manager').map((p) => ({ _id: p._id, name: p.name })),
      };
    }),
  });
});

const createDepartment = catchAsync(async (req, res) => {
  const { name, description } = req.body;
  if (!name || !name.trim()) throw new ApiError(400, 'name is required');
  const department = await Department.create({ name: name.trim(), description });
  res.status(201).json({ department: { ...department.toObject(), memberCount: 0 } });
});

const updateDepartment = catchAsync(async (req, res) => {
  const department = await Department.findById(req.params.id);
  if (!department) throw new ApiError(404, 'Department not found');
  const { name, description } = req.body;
  if (name !== undefined) {
    if (!name.trim()) throw new ApiError(400, 'name cannot be empty');
    department.name = name.trim();
  }
  if (description !== undefined) department.description = description;
  await department.save();
  res.status(200).json({ department });
});

const deleteDepartment = catchAsync(async (req, res) => {
  const department = await Department.findByIdAndDelete(req.params.id);
  if (!department) throw new ApiError(404, 'Department not found');
  await User.updateMany({ department: department._id }, { $set: { department: null } });
  res.status(204).send();
});

module.exports = { listDepartments, createDepartment, updateDepartment, deleteDepartment };
