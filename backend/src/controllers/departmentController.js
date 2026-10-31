const Department = require('../models/Department');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

const listDepartments = catchAsync(async (req, res) => {
  const departments = await Department.find().sort('name').lean();
  const counts = await User.aggregate([
    { $match: { department: { $ne: null } } },
    { $group: { _id: '$department', count: { $sum: 1 } } },
  ]);
  const byId = new Map(counts.map((c) => [c._id.toString(), c.count]));
  res.status(200).json({
    departments: departments.map((d) => ({ ...d, memberCount: byId.get(d._id.toString()) || 0 })),
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
