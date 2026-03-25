const nano = require('nano');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendEmail } = require('../config/email');

const couchdbUrl = process.env.COUCHDB_URL || 'http://admin:adminpw@localhost:5984';
const couch = nano(couchdbUrl);

class SignatureManagementService {
    constructor() {
        this.universityDb = couch.use('university_users');
    }

    /**
     * Generate random password for approver
     */
    generatePassword() {
        return crypto.randomBytes(6).toString('hex'); // 12 character password
    }

    /**
     * Add or update approval role for a university
     */
    async addApprovalRole(universityId, roleData) {
        try {
            // Get university document
            const university = await this.universityDb.get(universityId);

            // Initialize approvalRoles array if not exists
            if (!university.approvalRoles) {
                university.approvalRoles = [];
            }

            // Prevent duplicate role names (e.g., only one VC, one Registrar, one Controller)
            const normalizedRoleName = roleData.roleName.trim().toLowerCase();
            const existingRole = university.approvalRoles.find(
                r => r.roleName.trim().toLowerCase() === normalizedRoleName && r.isActive !== false
            );
            if (existingRole) {
                throw new Error(`A ${roleData.roleName} role already exists for this university. Please delete the existing one before adding a new one.`);
            }

            // Generate login credentials for approver
            const temporaryPassword = this.generatePassword();
            const passwordHash = await bcrypt.hash(temporaryPassword, 10);

            // Create new role
            const newRole = {
                roleId: `ROLE_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                roleName: roleData.roleName,
                roleType: roleData.roleType || 'approver',
                holderName: roleData.holderName,
                holderEmail: roleData.holderEmail,
                holderPhone: roleData.holderPhone || '',
                passwordHash: passwordHash,
                signature: null,
                signatureMethod: null,
                approvalOrder: roleData.approvalOrder || (university.approvalRoles.length + 1),
                isActive: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            // Add to roles array
            university.approvalRoles.push(newRole);

            // Update university document
            await this.universityDb.insert(university);

            // Send credentials email to the approver
            try {
                await sendEmail(roleData.holderEmail, 'approverCredentials', {
                    approverName: roleData.holderName,
                    roleName: roleData.roleName,
                    universityName: university.name || university.universityName,
                    email: roleData.holderEmail,
                    tempPassword: temporaryPassword,
                    loginUrl: (process.env.FRONTEND_URL || 'http://localhost:3000') + '/login'
                });
                console.log(`Credentials email sent to ${roleData.holderEmail}`);
            } catch (emailError) {
                console.error('Failed to send credentials email:', emailError.message);
            }

            return {
                success: true,
                role: {
                    ...newRole,
                    temporaryPassword: temporaryPassword
                },
                message: 'Role created successfully. Credentials have been sent to the approver\'s email.'
            };
        } catch (error) {
            console.error('Error adding approval role:', error);
            throw error;
        }
    }

    /**
     * Approver Login
     */
    async approverLogin(email, password) {
        try {
            // Search all universities for this email in approvalRoles
            const query = {
                selector: {
                    approvalRoles: {
                        $elemMatch: {
                            holderEmail: email,
                            isActive: true
                        }
                    }
                },
                limit: 100
            };

            const result = await this.universityDb.find(query);

            if (result.docs.length === 0) {
                throw new Error('Invalid email or password');
            }

            // Find the matching role across all universities
            let matchedUniversity = null;
            let matchedRole = null;

            for (const university of result.docs) {
                if (university.approvalRoles) {
                    const role = university.approvalRoles.find(
                        r => r.holderEmail === email && r.isActive
                    );
                    if (role) {
                        matchedUniversity = university;
                        matchedRole = role;
                        break;
                    }
                }
            }

            if (!matchedRole) {
                throw new Error('Invalid email or password');
            }

            if (!matchedRole.passwordHash) {
                throw new Error('Account not set up. Please contact your university administrator.');
            }

            // Verify password
            const isValidPassword = await bcrypt.compare(password, matchedRole.passwordHash);
            if (!isValidPassword) {
                throw new Error('Invalid email or password');
            }

            return {
                success: true,
                approver: {
                    roleId: matchedRole.roleId,
                    roleName: matchedRole.roleName,
                    holderName: matchedRole.holderName,
                    holderEmail: matchedRole.holderEmail,
                    universityId: matchedUniversity._id,
                    universityName: matchedUniversity.name || matchedUniversity.universityName || 'University',
                    hasSignature: !!matchedRole.signature
                }
            };
        } catch (error) {
            console.error('Approver login error:', error);
            throw error;
        }
    }

    /**
     * Update approver password
     */
    async updateApproverPassword(universityId, roleId, currentPassword, newPassword) {
        try {
            const university = await this.universityDb.get(universityId);

            if (!university.approvalRoles) {
                throw new Error('No approval roles found');
            }

            const roleIndex = university.approvalRoles.findIndex(r => r.roleId === roleId);
            if (roleIndex === -1) {
                throw new Error('Role not found');
            }

            const role = university.approvalRoles[roleIndex];

            // Verify current password
            const isValid = await bcrypt.compare(currentPassword, role.passwordHash);
            if (!isValid) {
                throw new Error('Current password is incorrect');
            }

            // Hash new password
            university.approvalRoles[roleIndex].passwordHash = await bcrypt.hash(newPassword, 10);
            university.approvalRoles[roleIndex].updatedAt = new Date().toISOString();

            await this.universityDb.insert(university);

            return {
                success: true,
                message: 'Password updated successfully'
            };
        } catch (error) {
            console.error('Error updating approver password:', error);
            throw error;
        }
    }

    /**
     * Reset approver password (by university admin) — generates a new temp password
     */
    async resetApproverPassword(universityId, roleId) {
        try {
            const university = await this.universityDb.get(universityId);

            if (!university.approvalRoles) {
                throw new Error('No approval roles found');
            }

            const roleIndex = university.approvalRoles.findIndex(r => r.roleId === roleId);
            if (roleIndex === -1) {
                throw new Error('Role not found');
            }

            const role = university.approvalRoles[roleIndex];

            // Generate new temp password
            const tempPassword = this.generatePassword();
            university.approvalRoles[roleIndex].passwordHash = await bcrypt.hash(tempPassword, 10);
            university.approvalRoles[roleIndex].updatedAt = new Date().toISOString();

            await this.universityDb.insert(university);

            // Try to email new credentials
            try {
                await sendEmail(role.holderEmail, 'approverCredentials', {
                    approverName: role.holderName,
                    roleName: role.roleName,
                    universityName: university.name || university.universityName,
                    email: role.holderEmail,
                    temporaryPassword: tempPassword
                });
            } catch (emailErr) {
                console.warn('Could not email new credentials:', emailErr.message);
            }

            return {
                success: true,
                message: 'Password reset successfully',
                temporaryPassword: tempPassword,
                email: role.holderEmail,
                roleName: role.roleName
            };
        } catch (error) {
            console.error('Error resetting approver password:', error);
            throw error;
        }
    }

    /**
     * Get approver profile
     */
    async getApproverProfile(universityId, roleId) {
        try {
            const university = await this.universityDb.get(universityId);

            if (!university.approvalRoles) {
                throw new Error('No approval roles found');
            }

            const role = university.approvalRoles.find(r => r.roleId === roleId);
            if (!role) {
                throw new Error('Role not found');
            }

            return {
                success: true,
                profile: {
                    roleId: role.roleId,
                    roleName: role.roleName,
                    holderName: role.holderName,
                    holderEmail: role.holderEmail,
                    holderPhone: role.holderPhone,
                    hasSignature: !!role.signature,
                    universityName: university.name || university.universityName || 'University',
                    createdAt: role.createdAt
                }
            };
        } catch (error) {
            console.error('Error getting approver profile:', error);
            throw error;
        }
    }

    /**
     * Save signature for approver (used by approver portal)
     */
    async saveSignature(universityId, roleId, signatureData, method) {
        try {
            return await this.updateRoleSignature(universityId, roleId, signatureData, method);
        } catch (error) {
            console.error('Error saving signature:', error);
            throw error;
        }
    }

    /**
     * Get signature for approver
     */
    async getSignature(universityId, roleId) {
        try {
            const university = await this.universityDb.get(universityId);

            if (!university.approvalRoles) {
                throw new Error('No approval roles found');
            }

            const role = university.approvalRoles.find(r => r.roleId === roleId);
            if (!role) {
                throw new Error('Role not found');
            }

            return {
                success: true,
                signatureData: role.signature || null,
                signatureMethod: role.signatureMethod || null
            };
        } catch (error) {
            console.error('Error getting signature:', error);
            throw error;
        }
    }

    /**
     * Save default signature placement position for approver
     */
    async saveSignaturePosition(universityId, roleId, position) {
        try {
            const university = await this.universityDb.get(universityId);

            if (!university.approvalRoles) {
                throw new Error('No approval roles found');
            }

            const roleIndex = university.approvalRoles.findIndex(r => r.roleId === roleId);
            if (roleIndex === -1) {
                throw new Error('Role not found');
            }

            university.approvalRoles[roleIndex].signatureDefaultPosition = {
                xPercent: position.xPercent,
                yPercent: position.yPercent
            };
            university.approvalRoles[roleIndex].updatedAt = new Date().toISOString();

            await this.universityDb.insert(university);

            return {
                success: true,
                message: 'Signature position saved successfully'
            };
        } catch (error) {
            console.error('Error saving signature position:', error);
            throw error;
        }
    }

    /**
     * Get saved signature placement position for approver
     */
    async getSignaturePosition(universityId, roleId) {
        try {
            const university = await this.universityDb.get(universityId);

            if (!university.approvalRoles) {
                throw new Error('No approval roles found');
            }

            const role = university.approvalRoles.find(r => r.roleId === roleId);
            if (!role) {
                throw new Error('Role not found');
            }

            return {
                success: true,
                signaturePosition: role.signatureDefaultPosition || null
            };
        } catch (error) {
            console.error('Error getting signature position:', error);
            throw error;
        }
    }

    /**
     * Update approval role
     */
    async updateApprovalRole(universityId, roleId, updateData) {
        try {
            const university = await this.universityDb.get(universityId);

            if (!university.approvalRoles) {
                throw new Error('No approval roles found for this university');
            }

            const roleIndex = university.approvalRoles.findIndex(r => r.roleId === roleId);
            if (roleIndex === -1) {
                throw new Error('Role not found');
            }

            // Update role fields
            const role = university.approvalRoles[roleIndex];
            if (updateData.roleName) role.roleName = updateData.roleName;
            if (updateData.holderName) role.holderName = updateData.holderName;
            if (updateData.holderEmail) role.holderEmail = updateData.holderEmail;
            if (updateData.holderPhone) role.holderPhone = updateData.holderPhone;
            if (updateData.approvalOrder) role.approvalOrder = updateData.approvalOrder;
            if (updateData.isActive !== undefined) role.isActive = updateData.isActive;
            
            role.updatedAt = new Date().toISOString();

            university.approvalRoles[roleIndex] = role;

            // Update university document
            await this.universityDb.insert(university);

            return {
                success: true,
                role: role
            };
        } catch (error) {
            console.error('Error updating approval role:', error);
            throw error;
        }
    }

    /**
     * Upload or draw signature for a role
     */
    async updateRoleSignature(universityId, roleId, signatureData, method) {
        try {
            const university = await this.universityDb.get(universityId);

            if (!university.approvalRoles) {
                throw new Error('No approval roles found for this university');
            }

            const roleIndex = university.approvalRoles.findIndex(r => r.roleId === roleId);
            if (roleIndex === -1) {
                throw new Error('Role not found');
            }

            // Update signature
            university.approvalRoles[roleIndex].signature = signatureData; // base64 string
            university.approvalRoles[roleIndex].signatureMethod = method; // 'drawn' or 'uploaded'
            university.approvalRoles[roleIndex].updatedAt = new Date().toISOString();

            // Update university document
            await this.universityDb.insert(university);

            return {
                success: true,
                message: 'Signature updated successfully'
            };
        } catch (error) {
            console.error('Error updating signature:', error);
            throw error;
        }
    }

    /**
     * Delete approval role
     */
    async deleteApprovalRole(universityId, roleId) {
        try {
            const university = await this.universityDb.get(universityId);

            if (!university.approvalRoles) {
                throw new Error('No approval roles found for this university');
            }

            // Remove role
            university.approvalRoles = university.approvalRoles.filter(r => r.roleId !== roleId);

            // Update university document
            await this.universityDb.insert(university);

            return {
                success: true,
                message: 'Role deleted successfully'
            };
        } catch (error) {
            console.error('Error deleting approval role:', error);
            throw error;
        }
    }

    /**
     * Get all approval roles for a university
     */
    async getApprovalRoles(universityId) {
        try {
            const university = await this.universityDb.get(universityId);

            return {
                success: true,
                roles: university.approvalRoles || []
            };
        } catch (error) {
            console.error('Error getting approval roles:', error);
            throw error;
        }
    }

    /**
     * Get role by email (for login/authentication)
     */
    async getRoleByEmail(email) {
        try {
            // Query all universities
            const queryString = {
                selector: {
                    docType: 'university',
                    approvalRoles: {
                        $elemMatch: {
                            holderEmail: email,
                            isActive: true
                        }
                    }
                }
            };

            const result = await this.universityDb.find(queryString);

            if (result.docs.length === 0) {
                return null;
            }

            const university = result.docs[0];
            const role = university.approvalRoles.find(r => r.holderEmail === email && r.isActive);

            return {
                universityId: university.id,
                universityName: university.name,
                role: role
            };
        } catch (error) {
            console.error('Error getting role by email:', error);
            throw error;
        }
    }

    /**
     * Reorder approval roles
     */
    async reorderApprovalRoles(universityId, roleOrders) {
        try {
            // roleOrders is array of {roleId, approvalOrder}
            const university = await this.universityDb.get(universityId);

            if (!university.approvalRoles) {
                throw new Error('No approval roles found for this university');
            }

            // Update order for each role
            roleOrders.forEach(orderItem => {
                const roleIndex = university.approvalRoles.findIndex(r => r.roleId === orderItem.roleId);
                if (roleIndex !== -1) {
                    university.approvalRoles[roleIndex].approvalOrder = orderItem.approvalOrder;
                    university.approvalRoles[roleIndex].updatedAt = new Date().toISOString();
                }
            });

            // Sort by approval order
            university.approvalRoles.sort((a, b) => a.approvalOrder - b.approvalOrder);

            // Update university document
            await this.universityDb.insert(university);

            return {
                success: true,
                roles: university.approvalRoles
            };
        } catch (error) {
            console.error('Error reordering approval roles:', error);
            throw error;
        }
    }
}

module.exports = new SignatureManagementService();
